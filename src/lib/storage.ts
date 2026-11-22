import { createMMKV } from 'react-native-mmkv';
import { createJSONStorage, type StateStorage } from 'zustand/middleware';

const mmkv = createMMKV({ id: 'flare' });

const stateStorage: StateStorage = {
  getItem: key => mmkv.getString(key) ?? null,
  setItem: (key, value) => mmkv.set(key, value),
  removeItem: key => {
    mmkv.remove(key);
  },
};

export const persistStorage = createJSONStorage(() => stateStorage);
