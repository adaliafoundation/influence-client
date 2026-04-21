// TODO: ecs refactor -- maybe deprecated? what about random event stories?

// import { useQuery } from '~/compat/react-query';
// import useSession from '~/hooks/useSession';

// import api from '~/lib/api';

// const useBook = (id) => {
//   const { token } = useSession();

//   return useQuery(
//     [ 'book', id, token ],
//     () => api.getBook(id),
//     {
//       enabled: !!id,
//       retry: false
//     }
//   );
// };

// export default useBook;
