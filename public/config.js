window.APP_CONFIG = {
/*

This file is made to be overwritten automatically before starting the app and contain all REACT_APP variables read from environment
The goal is to support runtime injection of the config. A react app normally reads environment variable on build/compile time and
hardcodes the values in the built application, which is incompatible with the idea of building a single Docker image and reusing it
in multiple environments. Runtime config injection solves this.

*/
};
