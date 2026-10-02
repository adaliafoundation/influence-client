import { createContext, useContext } from 'react';

const ActionSubmissionContext = createContext(null);
export const useActionSubmission = () => useContext(ActionSubmissionContext);
export default ActionSubmissionContext;
