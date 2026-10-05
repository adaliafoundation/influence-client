import { useEffect, useState } from 'react';

const useActionItemTransitions = (items, duration) => {
  const [displayItems, setDisplayItems] = useState(items);

  useEffect(() => {
    const currentKeys = new Set(items.map(item => item.uniqueKey));
    setDisplayItems(previous => {
      const next = [...items];
      previous.forEach((item, index) => {
        if (!currentKeys.has(item.uniqueKey)) {
          next.splice(index, 0, { ...item, transitionOut: true });
        }
      });
      return next;
    });
    // Superseded snapshots must never reappear after a newer list arrives.
    const timeout = setTimeout(() => setDisplayItems(items), duration);
    return () => clearTimeout(timeout);
  }, [items, duration]);

  return displayItems;
};

export default useActionItemTransitions;
