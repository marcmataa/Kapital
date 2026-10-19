import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { api } from './api';

export function crearStore() {
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (porDefecto) => porDefecto().concat(api.middleware),
  });
  setupListeners(store.dispatch);
  return store;
}

export const store = crearStore();

export type AppStore = ReturnType<typeof crearStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
