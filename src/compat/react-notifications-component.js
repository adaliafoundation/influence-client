import { useCallback, useSyncExternalStore } from 'react';

let notifications = [];
const listeners = new Set();
const timers = new Map();

const emit = () => {
  listeners.forEach((listener) => listener());
};

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => notifications;

const normalizeDismiss = (dismiss = {}) => ({
  duration: dismiss?.duration || 0,
  showIcon: dismiss?.showIcon !== false
});

const removeNotification = (id) => {
  let removed;
  notifications = notifications.filter((notification) => {
    if (notification.id === id) {
      removed = notification;
      return false;
    }
    return true;
  });

  if (!removed) return null;

  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }

  emit();

  if (typeof removed.onRemoval === 'function') {
    try {
      removed.onRemoval();
    } catch (error) {
      console.error(error);
    }
  }

  return removed;
};

const addNotification = (options = {}) => {
  const id = options.id || `rnc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const dismiss = normalizeDismiss(options.dismiss);

  notifications = [...notifications, {
    ...options,
    dismiss,
    id
  }];

  if (dismiss.duration > 0) {
    timers.set(id, setTimeout(() => removeNotification(id), dismiss.duration));
  }

  emit();
  return id;
};

export const Store = {
  addNotification,
  removeNotification
};

export const ReactNotifications = () => {
  const queue = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const dismiss = useCallback((id) => () => removeNotification(id), []);

  return (
    <div className="rnc__notification-container--top-center">
      {queue.map((notification) => {
        const animationIn = Array.isArray(notification.animationIn) ? notification.animationIn.join(' ') : '';
        return (
          <div
            className={`rnc__notification-item rnc__notification-item--${notification.type || 'info'} ${animationIn}`}
            key={notification.id}
            style={notification.width ? { width: `${notification.width}px` } : undefined}>
            {notification.dismiss.showIcon && (
              <button className="rnc__notification-close-mark" onClick={dismiss(notification.id)} type="button" />
            )}
            {notification.message}
          </div>
        );
      })}
    </div>
  );
};
