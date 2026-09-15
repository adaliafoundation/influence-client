export const getRandomAdalianAppearance = () => {
  const gender = Math.ceil(Math.random() * 2);
  const faces = gender === 1 ? [0, 1, 3, 4, 5, 6, 7] : [0, 1, 2];
  const hairs = gender === 1 ? [0, 1, 2, 3, 4, 5] : [0, 6, 7, 8, 9, 10, 11];

  return {
    gender,
    body: (gender - 1) * 6 + Math.ceil(Math.random() * 6),
    face: faces[Math.floor(Math.random() * faces.length)],
    hair: hairs[Math.floor(Math.random() * hairs.length)],
    hairColor: Math.ceil(Math.random() * 5),
    clothesOffset: 31 + Math.ceil(Math.random() * 2),
    head: 0,
    item: 0
  };
};
