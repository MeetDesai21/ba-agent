// server/api.js
// With these updated imports
import { ChatAnthropic } from '@langchain/anthropic';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { Groq } from 'groq-sdk';

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Choose which LLM to use
const useLLM = process.env.LLM_PROVIDER || 'groq';

// Initialize the Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || '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',
});

// Helper function to convert text description to PlantUML code
function generatePlantUMLCode(description, type) {
  // Basic template based on diagram type
  let plantUMLCode = '';
  
  switch (type.toLowerCase()) {
    case 'usecase':
      plantUMLCode = `@startuml
title ${description.split('\n')[0]}
left to right direction
skinparam packageStyle rectangle

' Actors
actor User
actor Admin

' Use Cases
rectangle System {
${description.split('\n').slice(1).map(line => {
  if (line.trim().startsWith('-')) {
    return `  usecase "${line.trim().substring(1).trim()}"`;
  }
  return line;
}).join('\n')}
}

' Relationships
User --> (Login)
User --> (View Dashboard)
Admin --> (Manage Users)
Admin --> (Configure System)

@enduml`;
      break;
      
    case 'sequence':
      plantUMLCode = `@startuml
title ${description.split('\n')[0]}
skinparam sequenceMessageAlign center
skinparam responseMessageBelowArrow true

participant User
participant Frontend
participant Backend
participant Database

${description.split('\n').slice(1).join('\n')}

@enduml`;
      break;
      
    case 'class':
      plantUMLCode = `@startuml
title ${description.split('\n')[0]}
skinparam classAttributeIconSize 0
skinparam classFontStyle bold
skinparam classArrowColor #2688d4
skinparam classBackgroundColor WhiteSmoke
skinparam classBorderColor #2688d4

${description.split('\n').slice(1).join('\n')}

@enduml`;
      break;
      
    case 'activity':
      plantUMLCode = `@startuml
title ${description.split('\n')[0]}
skinparam ActivityBackgroundColor WhiteSmoke
skinparam ActivityBorderColor #2688d4
skinparam ActivityDiamondBackgroundColor WhiteSmoke
skinparam ActivityDiamondBorderColor #2688d4

start
${description.split('\n').slice(1).join('\n')}
stop

@enduml`;
      break;
      
    case 'component':
      plantUMLCode = `@startuml
title ${description.split('\n')[0]}
skinparam componentStyle uml2
skinparam component {
  BackgroundColor WhiteSmoke
  BorderColor #2688d4
  ArrowColor #2688d4
}

${description.split('\n').slice(1).join('\n')}

@enduml`;
      break;
      
    default:
      plantUMLCode = `@startuml
title ${description.split('\n')[0]}
skinparam defaultFontName Arial
skinparam defaultFontSize 12

${description.split('\n').slice(1).join('\n')}

@enduml`;
  }
  
  return plantUMLCode;
}

// Modify the document generation prompt to include better UML guidance
const documentGenerationPrompt = PromptTemplate.fromTemplate(`
You are an expert business analyst and technical writer. Based on the following business requirements, 
create comprehensive documentation including:
1. Software Requirements Specification (SRS)
2. Functional Requirements Document (FRD)
3. Business Requirements Document (BRD)
4. UML Diagrams (in PlantUML format)

For UML diagrams, provide the following:
1. Use Case Diagram showing system actors and their interactions
2. Sequence Diagram showing the main user interactions and system flow
3. Class Diagram showing the main entities and their relationships
4. Activity Diagram showing the main business processes
5. Component Diagram showing the system architecture

For each diagram, follow these guidelines:
- Use Case Diagrams: Define actors and their use cases with proper relationships (extends, includes)
- Sequence Diagrams: Show message flows between actors, frontend, backend, and database
- Class Diagrams: Include proper class definitions with attributes, methods, and relationships
- Activity Diagrams: Show workflow with proper decision points and parallel activities
- Component Diagrams: Show system components and their interfaces

Business Requirements:
{requirements}

You must respond with ONLY a valid JSON object using the following structure:

RESPONSE FORMAT:
{{
  "srs": "<detailed SRS document content>",
  "frd": "<detailed FRD document content>",
  "brd": "<detailed BRD document content>",
  "umlDiagrams": [
    {{
      "name": "<diagram name>",
      "type": "<diagram type: usecase|sequence|class|activity|component>",
      "description": "<text description of what the diagram shows>",
      "content": "<PlantUML code for the diagram>"
    }}
  ]
}}

Important: 
1. Do not include any text outside the JSON object
2. Ensure all strings are properly escaped
3. Use double quotes for all keys and string values
4. Make the response a single, valid JSON object
5. For UML diagrams, provide valid PlantUML code that can be rendered
6. Include proper PlantUML syntax with @startuml and @enduml tags
7. Follow PlantUML best practices for each diagram type
`);

// Helper function to repair common JSON issues
function repairJSON(str) {
  // Remove any XML-like or markdown tags
  str = str.replace(/<[^>]+>/g, '');
  str = str.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  
  // Find the first { and last } to extract just the JSON part
  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1) {
    str = str.slice(firstBrace, lastBrace + 1);
  }
  
  // Fix common JSON issues
  str = str
    // Fix quotes
    .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":') // Ensure property names are properly quoted
    .replace(/:\s*'([^']*)'/g, ':"$1"') // Replace single quotes with double quotes for values
    .replace(/:\s*"([^"]*)'/g, ':"$1"') // Fix mismatched quotes
    .replace(/:\s*'([^"]*)/g, ':"$1"') // Fix single quotes
    // Fix common structural issues
    .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
    .replace(/([}\]])\s*,\s*$/g, '$1') // Remove trailing commas at end
    .replace(/}\s*{/g, '},{') // Fix missing commas between objects
    .replace(/]\s*{/g, ',{') // Fix missing commas between array and object
    .replace(/}\s*\[/g, ',[') // Fix missing commas between object and array
    .replace(/]\s*\[/g, ',[') // Fix missing commas between arrays
    // Clean whitespace
    .replace(/\s+/g, ' ')
    .trim();
  
  return str;
}

// Helper function to use Groq for completions
async function getGroqCompletion(prompt) {
  try {
    console.log('Sending request to Groq API with prompt:', prompt);
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { 
          role: "system", 
          content: "You are a helpful assistant that always responds with valid JSON. Never include any text outside the JSON structure. Never include XML-like tags. Always use double quotes for keys and string values. Never include markdown formatting. Never include any text after the closing brace of the JSON object. Never include any explanations or additional text."
        },
        { 
          role: "user", 
          content: prompt 
        }
      ],
      model: "mistral-saba-24b",
      temperature: 0.0, // Reduce temperature to get more consistent JSON
      max_tokens: 4096,
      top_p: 1,
      stream: false,
      stop: null
    });
    
    console.log('Received raw response from Groq:', chatCompletion);
    let content = chatCompletion.choices[0]?.message?.content || '';
    
    // Log the raw content before cleaning
    console.log('Raw content before cleaning:', content);
    
    // First pass: Basic cleaning
    content = content.trim();
    
    // Try parsing the raw content first
    try {
      return JSON.stringify(JSON.parse(content));
    } catch (initialParseError) {
      console.log('Initial parse failed, attempting repair...');
      
      // Second pass: Repair and try again
      const repairedContent = repairJSON(content);
      console.log('Repaired content:', repairedContent);
      
      try {
        return JSON.stringify(JSON.parse(repairedContent));
      } catch (repairParseError) {
        console.log('Repair parse failed, attempting final fallback...');
        
        // Final attempt: Try to extract any valid JSON object
        const jsonRegex = /\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}/g;
        const matches = repairedContent.match(jsonRegex);
        
        if (matches && matches.length > 0) {
          for (const match of matches) {
            try {
              return JSON.stringify(JSON.parse(match));
            } catch (e) {
              continue;
            }
          }
        }
        
        throw new Error(`Failed to parse JSON after all repair attempts: ${repairParseError.message}`);
      }
    }
  } catch (error) {
    console.error("Error with Groq API:", error.message);
    console.error("Full error object:", JSON.stringify(error, null, 2));
    throw new Error(`Groq API Error: ${error.message}`);
  }
}

// API Routes with Groq implementation
app.post('/api/generate-documents', async (req, res) => {
  try {
    console.log('Received generate-documents request:', req.body);
    const { requirements } = req.body;
    
    if (!requirements) {
      return res.status(400).json({ error: 'Requirements are required' });
    }

    const prompt = await documentGenerationPrompt.format({ requirements });
    console.log('Formatted prompt:', prompt);
    
    const completion = await getGroqCompletion(prompt);
    console.log('Raw completion:', completion);
    
    try {
      // Parse the JSON response
      const result = JSON.parse(completion);
      
      // Process UML diagrams
      if (result.umlDiagrams && Array.isArray(result.umlDiagrams)) {
        result.umlDiagrams = result.umlDiagrams.map(diagram => ({
          ...diagram,
          content: diagram.content || generatePlantUMLCode(diagram.description, diagram.type)
        }));
      }
      
      // Validate the response structure
      if (!result.srs || !result.frd || !result.brd || !Array.isArray(result.umlDiagrams)) {
        throw new Error('Invalid response structure from AI');
      }
      
      console.log('Processed UML diagrams:', result.umlDiagrams);
      res.json(result);
    } catch (parseError) {
      console.error('Error parsing JSON response:', parseError);
      console.error('Raw completion that failed to parse:', completion);
      res.status(500).json({ 
        error: 'Failed to parse AI response',
        details: parseError.message,
        rawResponse: completion
      });
    }
  } catch (error) {
    console.error('Error generating documents:', error);
    console.error('Full error object:', JSON.stringify(error, null, 2));
    res.status(500).json({ 
      error: error.message,
      stack: error.stack,
      details: 'Error occurred while processing the request'
    });
  }
});

app.post('/api/conduct-research', async (req, res) => {
  try {
    const { requirements } = req.body;
    const prompt = `
      You are an expert market researcher. Based on the following business requirements, 
      conduct a thorough competitive analysis:
      
      Business Requirements:
      ${requirements}
      
      Provide your research in a structured JSON format with the following keys:
      competitors (an array of objects with name, strengths, and weaknesses),
      marketTrends (a detailed description of current market trends),
      recommendations (strategic recommendations based on the research)
    `;
    
    const completion = await getGroqCompletion(prompt);
    
    // Parse the JSON response
    const result = JSON.parse(completion);
    res.json(result);
  } catch (error) {
    console.error('Error conducting research:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/breakdown-tasks', async (req, res) => {
  try {
    console.log('Received breakdown-tasks request:', req.body);
    const { documents } = req.body;
    
    if (!documents) {
      return res.status(400).json({ 
        error: 'Documents are required',
        details: 'The request body must contain documents object'
      });
    }

    // Create a combined document for task breakdown
    const combinedDoc = `
      ${documents.srs ? `SRS Document: ${documents.srs}` : ''}
      ${documents.frd ? `FRD Document: ${documents.frd}` : ''}
      ${documents.brd ? `BRD Document: ${documents.brd}` : ''}
    `;

    const prompt = `
      You are an expert technical project manager. Based on the following documents,
      break down the project into detailed technical tasks.
      
      ${combinedDoc}
      
      For each task, provide:
      1. A descriptive name
      2. A detailed description
      3. Estimated hours required (a numeric value)
      4. Required skills (as an array of skill names)
      
      Return your response as a JSON array of task objects, each with:
      - id (string or number)
      - name (string)
      - description (string)
      - estimatedHours (number)
      - requiredSkills (array of strings)
      
      Important:
      1. Tasks should be specific and actionable
      2. Skills should be specific technical skills (e.g., "React", "Node.js", "SQL")
      3. Time estimates should be realistic
      4. Each task should be self-contained and testable
      5. Always return an array, even if only one task
    `;
    
    console.log('Sending prompt to Groq:', prompt);
    const completion = await getGroqCompletion(prompt);
    console.log('Received completion from Groq:', completion);
    
    try {
      // Parse the JSON response
      const result = JSON.parse(completion);
      
      // Check if result is directly an array or has a tasks property
      let tasks = [];
      if (Array.isArray(result)) {
        tasks = result;
      } else if (result.tasks && Array.isArray(result.tasks)) {
        tasks = result.tasks;
      } else {
        // If neither, create a fallback task
        tasks = [{
          id: "1",
          name: "Review Requirements",
          description: "Review the provided documentation and break down into actionable tasks.",
          estimatedHours: 4,
          requiredSkills: ["Business Analysis", "Project Management"]
        }];
      }
      
      // Ensure all tasks have the required fields
      const validatedTasks = tasks.map((task, index) => ({
        id: task.id || `task_${index + 1}`,
        name: task.name || `Task ${index + 1}`,
        description: task.description || "No description provided",
        estimatedHours: typeof task.estimatedHours === 'number' ? task.estimatedHours : 4,
        requiredSkills: Array.isArray(task.requiredSkills) ? task.requiredSkills : ["General"]
      }));
      
      console.log('Successfully processed tasks:', validatedTasks);
      res.json({ tasks: validatedTasks });
    } catch (parseError) {
      console.error('Error parsing JSON response:', parseError);
      console.error('Raw completion that failed to parse:', completion);
      
      // Provide fallback tasks in case of parsing error
      const fallbackTasks = [
        {
          id: "fallback_1",
          name: "Review Project Requirements",
          description: "Review the documentation and identify key technical requirements.",
          estimatedHours: 4,
          requiredSkills: ["Business Analysis", "Technical Documentation"]
        },
        {
          id: "fallback_2",
          name: "Create Technical Implementation Plan",
          description: "Develop a technical plan based on project requirements.",
          estimatedHours: 8,
          requiredSkills: ["Project Management", "Technical Architecture"]
        }
      ];
      
      res.json({ tasks: fallbackTasks });
    }
  } catch (error) {
    console.error('Error breaking down tasks:', error);
    console.error('Full error object:', JSON.stringify(error, null, 2));
    
    // Provide fallback tasks even in case of general error
    const emergencyFallbackTasks = [
      {
        id: "emergency_1",
        name: "Document Review",
        description: "Review project requirements and documents.",
        estimatedHours: 4,
        requiredSkills: ["Documentation", "Analysis"]
      }
    ];
    
    res.json({ 
      tasks: emergencyFallbackTasks,
      error: error.message
    });
  }
});

app.post('/api/assign-tasks', async (req, res) => {
  try {
    const { tasks, teamMembers } = req.body;
    
    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: 'Tasks array is required and must not be empty' });
    }
    if (!teamMembers || !Array.isArray(teamMembers) || teamMembers.length === 0) {
      return res.status(400).json({ error: 'Team members array is required and must not be empty' });
    }

    const prompt = `
      You are an expert resource manager. Assign the following technical tasks to team members based on their skills:
      
      Tasks:
      ${JSON.stringify(tasks)}
      
      Team Members:
      ${JSON.stringify(teamMembers)}
      
      For each task, determine the best team member based on skill match. 
      Calculate a confidence score (0-100) based on how well the team member's skills match the required skills.
      
      Return your response as a JSON array of task objects, each with:
      - All original task fields (id, name, description, estimatedHours, requiredSkills)
      - assignedTo (the name of the assigned team member)
      - confidence (a number between 0-100 indicating the match quality)
      
      Important:
      1. Consider both technical skills and estimated hours
      2. Try to distribute work evenly among team members
      3. Assign tasks to the most qualified team member
      4. Consider task dependencies when assigning
    `;
    
    console.log('Sending task assignment prompt to Groq:', prompt);
    const completion = await getGroqCompletion(prompt);
    console.log('Received completion from Groq:', completion);
    
    try {
      const result = JSON.parse(completion);
      const assignments = Array.isArray(result) ? result : result.assignments;
      
      // Validate assignments
      assignments.forEach(assignment => {
        if (!assignment.assignedTo || typeof assignment.confidence !== 'number') {
          throw new Error(`Invalid assignment structure: ${JSON.stringify(assignment)}`);
        }
      });
      
      res.json(assignments);
    } catch (parseError) {
      console.error('Error parsing assignment response:', parseError);
      console.error('Raw completion that failed to parse:', completion);
      res.status(500).json({ 
        error: 'Failed to parse AI response',
        details: parseError.message,
        rawResponse: completion
      });
    }
  } catch (error) {
    console.error('Error assigning tasks:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Error occurred while processing the request'
    });
  }
});

app.post('/api/create-jira-tasks', async (req, res) => {
  try {
    const { assignedTasks, projectKey } = req.body;
    
    // In a real implementation, this would connect to the Jira API
    // For demo purposes, we're simulating the response
    const jiraTasks = assignedTasks.map(task => ({
      id: `${projectKey}-${task.id}`,
      summary: task.name,
      description: task.description,
      assignee: task.assignedTo,
      estimatedHours: task.estimatedHours,
      status: "To Do",
      created: new Date().toISOString()
    }));
    
    res.json(jiraTasks);
  } catch (error) {
    console.error('Error creating Jira tasks:', error);
    res.status(500).json({ error: error.message });
  }
});

// Change the port to avoid the EADDRINUSE error
const PORT = process.env.PORT || 3005;

// Add error handling for the server
const server = app.listen(PORT, () => {
  console.log(`LangChain AI Project Management API running on port ${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please try a different port.`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

export default app;