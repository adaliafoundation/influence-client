// Hiding the dialog shell does not stop its parent's hooks, queries or timers.
const withOpenDialog = Component => function OpenDialog(props) {
  return props.open ? <Component {...props} /> : null;
};

export default withOpenDialog;
