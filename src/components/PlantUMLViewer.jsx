import React, { useEffect, useState } from 'react';
import { Box, CircularProgress, Typography, Alert } from '@mui/material';
import plantumlEncoder from 'plantuml-encoder';

// Alternative PlantUML server URLs
const PLANTUML_SERVER = 'https://www.plantuml.com/plantuml';
const PLANTUML_SERVER_BACKUP = 'https://plantuml-server.kkeisuke.dev/svg';

const PlantUMLViewer = ({ content, title, darkMode }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    try {
      // Log the PlantUML content for debugging
      console.log('PlantUML content:', content);
      
      // Check if content is valid
      if (!content || content.trim().length === 0) {
        throw new Error('Empty PlantUML content');
      }
      
      // Ensure content has @startuml and @enduml
      let processedContent = content;
      if (!content.includes('@startuml')) {
        processedContent = `@startuml\n${processedContent}`;
      }
      if (!content.includes('@enduml')) {
        processedContent = `${processedContent}\n@enduml`;
      }

      console.log('Processed PlantUML content:', processedContent);
      
      // Encode the PlantUML content
      const encoded = plantumlEncoder.encode(processedContent);
      console.log('Encoded PlantUML:', encoded);
      
      // Create the URL for the rendered diagram
      const url = `${PLANTUML_SERVER}/svg/${encoded}`;
      console.log('PlantUML URL:', url);
      
      // Set the image URL
      setImageUrl(url);
      setLoading(false);
    } catch (err) {
      console.error('Error encoding PlantUML:', err);
      setError(`Failed to generate diagram: ${err.message}`);
      setLoading(false);
      
      // Try fallback method with simplified encoding
      try {
        setUseFallback(true);
        const fallbackContent = simplifyUml(content);
        console.log('Using simplified UML content:', fallbackContent);
        const fallbackEncoded = plantumlEncoder.encode(fallbackContent);
        const fallbackUrl = `${PLANTUML_SERVER_BACKUP}/${fallbackEncoded}`;
        console.log('Fallback PlantUML URL:', fallbackUrl);
        setImageUrl(fallbackUrl);
      } catch (fallbackErr) {
        console.error('Fallback encoding also failed:', fallbackErr);
      }
    }
  }, [content]);

  // Function to simplify UML for fallback
  const simplifyUml = (originalContent) => {
    // Extract diagram type from content
    let diagramType = 'class';
    if (originalContent.toLowerCase().includes('actor') || originalContent.toLowerCase().includes('usecase')) {
      diagramType = 'usecase';
    } else if (originalContent.toLowerCase().includes('participant') || originalContent.toLowerCase().includes('->')) {
      diagramType = 'sequence';
    } else if (originalContent.toLowerCase().includes('start') && originalContent.toLowerCase().includes('stop')) {
      diagramType = 'activity';
    } else if (originalContent.toLowerCase().includes('component')) {
      diagramType = 'component';
    }
    
    // Create a minimal version with just the essential elements
    let minimal = `@startuml
title ${title || 'UML Diagram'}
`;

    // Add appropriate content based on diagram type
    switch (diagramType) {
      case 'usecase':
        minimal += `
actor User
actor Admin
rectangle System {
  usecase "Use Case 1"
  usecase "Use Case 2"
}
User --> (Use Case 1)
Admin --> (Use Case 2)
`;
        break;
      case 'sequence':
        minimal += `
participant User
participant System
participant Database
User -> System: Request
System -> Database: Query
Database --> System: Response
System --> User: Result
`;
        break;
      case 'activity':
        minimal += `
start
:Process Task;
if (Condition) then (yes)
  :Task A;
else (no)
  :Task B;
endif
:Final Task;
stop
`;
        break;
      case 'component':
        minimal += `
package "Frontend" {
  [UI Components]
}
package "Backend" {
  [API]
  [Database]
}
[UI Components] --> [API]
[API] --> [Database]
`;
        break;
      default: // class diagram
        minimal += `
class User {
  +username: String
  +email: String
  +login()
}
class System {
  +processRequest()
}
User -- System
`;
    }
    
    minimal += '\n@enduml';
    return minimal;
  };

  if (loading && !useFallback) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2, color: 'error.main' }}>
        <Typography variant="body2">{error}</Typography>
      </Box>
    );
  }

  return (
    <Box 
      sx={{ 
        width: '100%',
        overflow: 'auto',
        bgcolor: darkMode ? 'rgba(255,255,255,0.03)' : 'white',
        borderRadius: 1,
        p: 2
      }}
    >
      {title && (
        <Typography variant="subtitle2" gutterBottom>
          {title}
        </Typography>
      )}
      <img 
        src={imageUrl} 
        alt={title || 'UML Diagram'} 
        style={{ 
          maxWidth: '100%',
          height: 'auto',
          filter: darkMode ? 'invert(0.85)' : 'none'
        }} 
      />
    </Box>
  );
};

export default PlantUMLViewer; 