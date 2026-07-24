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

## Test Environment
1. Initialize your .env file:
    ```
    echo "BUFFER_GLOBAL=1
    SKIP_PREFLIGHT_CHECK=1

    NODE_ENV=development
    REACT_APP_CONFIG_ENV=prerelease
    REACT_APP_APP_VERBOSELOGS=1" > .env
    ```
1. Adjust or fill in any missing .env variables as needed. Most values are preset in
`src/appConfig/prerelease.json`. However, if you need to overwrite any of these presets,
you can do so in your local env file by following the instructions in `src/appConfig/index.js`
    - For example, adding these settings may make development less cumbersome:
        ```
        REACT_APP_APP_DISABLEINTROANIMATION=1
        REACT_APP_APP_DISABLELAUNCHERLANDING=1
        REACT_APP_APP_DISABLELAUNCHTRAILER=1
        REACT_APP_APP_DISABLESCREENSIZEWARNING=1
        REACT_APP_APP_DEFAULTMUTED=1
        ```
    - The following api keys need to be filled in if you want to interact with all third-party apis:
        ```
        REACT_APP_API_CLIENTID_GOOGLE=
        REACT_APP_API_CLIENTID_LAYERSWAP=
        REACT_APP_API_CLIENTID_RAMP=
        ```
1. Run `npm install`.
1. Run `npm start`.

## Available Scripts

In the project directory, you can run:

### `runtime-injection.sh`

The app uses runtime configuration injection. Run this script to copy the relevant values from your environment to a `config.js` file read at runtime. This is needed before starting the app.

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

## Running as a Docker container 🐋
Notes:
- The `compose.yaml` file in the project expects a Docker network named `web` for the communication across containers (e.g. a Caddy container as reverse proxy). To create it, run `docker network create web` .
- By default the application port (3000) is only exposed to the `web` Docker network and not to the host machine. Un-comment the port configuration in the various `compose.yaml` files if needed.

### Build and run a development image
1. Download source
2. Initialize your `.env` file - `NODE_ENV=development`
3. Build the image from local source: `docker compose build`
4. Start the container: `docker compose up`

### Run an official prerelease or production image
1. Download `compose.prerelease.yaml` or `compose.prod.yaml`
2. Initialize your `.env` file - `NODE_ENV=production`
3. Start the container: `docker compose -f compose.prerelease.yaml up` or `docker compose -f compose.prod.yaml up`
