import { registerRootComponent } from 'expo';

import App from './App';

// Keep the entrypoint inside the project root so Metro can resolve App.tsx
// correctly when dependencies are installed with pnpm symlinks.
registerRootComponent(App);
