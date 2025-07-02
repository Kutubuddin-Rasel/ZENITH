import { createContext } from 'react';

const ProjectsCreateModalContext = createContext<React.Dispatch<React.SetStateAction<(() => void) | undefined>> | undefined>(undefined);

export default ProjectsCreateModalContext; 