# Influence Client

The browser game client for Influence.

## License
This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0).

Commercial use is not permitted without a separate license from Unstoppable Games, Inc.

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
