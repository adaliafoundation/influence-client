// TODO: ecs refactor -- maybe deprecated? what about random event stories?

// import { useQuery } from '~/compat/react-query';
// import useSession from '~/hooks/useSession';

// import api from '~/lib/api';

// const useCrewAssignments = () => {
//   const { token } = useSession();

//   return useQuery(
//     [ 'assignments', token ],
//     async () => {
//       const assignmentsByBook = {};
//       let totalAssignments = 0;
//       let crewRecruitmentStoryId;
//       let crewRecruitmentSessionId;

//       const assignments = (await api.getUserAssignments()) || [];
//       assignments.forEach((story) => {
//         const { book, isCrewRecruitmentStory } = story;
//         if (book) {
//           if (!assignmentsByBook[book.id]) {
//             assignmentsByBook[book.id] = {
//               id: book.id,
//               title: book.title,
//               stories: [],
//               actionable: false
//             };
//           }
//           assignmentsByBook[book.id].stories.push(story);
//           if (story.actionable > 0) {
//             assignmentsByBook[book.id].actionable = true;
//             totalAssignments += story.actionable;
//           }
//         } else if (isCrewRecruitmentStory) {
//           crewRecruitmentStoryId = story.id;
//           crewRecruitmentSessionId = story.openSession;
//         }
//       });

//       return {
//         assignmentsByBook: Object.values(assignmentsByBook),
//         crewRecruitmentStoryId,
//         crewRecruitmentSessionId,
//         totalAssignments
//       };
//     },
//     {
//       enabled: !!token
//     }
//   );
// };

// export default useCrewAssignments;
