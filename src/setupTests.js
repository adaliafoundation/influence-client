// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom does not implement the native dialog methods used by blocking dialogs.
if (typeof HTMLDialogElement !== 'undefined') {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = jest.fn(function () {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = jest.fn(function () {
      this.removeAttribute('open');
    });
  });
}
