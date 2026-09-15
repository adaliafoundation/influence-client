# Influence Client

The browser game client for Influence.

## License
This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0).
Commercial use is not permitted without a separate license from Unstoppable Games, Inc.

This license applies to the contents of this repository only. Externally hosted media assets referenced by the client,
including music, sounds, videos, story images, and 3D models, are not covered by this repository's license and are
licensed separately for use with the Influence client only.

For the avoidance of doubt:
The licensor considers non-commercial use under this license to include deployments or uses that collect funds solely
to recover the reasonable costs of operating, maintaining, or administering the software, provided that such use is
not primarily intended for or directed toward commercial advantage or monetary compensation, and that no profit is
distributed to operators, contributors, or participants.

## Local development

1. Use Node.js 22 and run `npm ci`.
2. Copy `.env.example` to `.env` and fill in the required public service endpoints.
3. Set `REACT_APP_CONFIG_ENV=prerelease` or `production` explicitly.
4. Run `npm start`.

Optional integrations are hidden when their configuration is absent. See
[Runtime client configuration](docs/runtime-configuration.md) for required services,
optional features, types, and container deployment instructions. `NODE_ENV` is
managed by the build tool; it does not select the game network.

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

## Container deployments

The production image is built once and configured when it starts. The same image
digest is suitable for prerelease and production; set `REACT_APP_CONFIG_ENV` to
select the versioned defaults and provide any operator-specific public overrides
through the deployment stack.

Operator-specific service endpoints, IDs, and keys must be supplied at runtime rather
than committed to this repository. See
[Runtime client configuration](docs/runtime-configuration.md) for the complete
configuration and security contract.
