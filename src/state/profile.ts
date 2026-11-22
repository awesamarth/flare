import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage } from '../lib/storage';
import { MEMBER_COLORS } from '../theme';

type ProfileState = {
  name: string | null;
  /** Preferred color; each group may end up with a different one if taken. */
  color: string;
  /** This device's mesh address (`off1…`), known once the mesh has started. */
  address: string | null;
  setProfile: (name: string, color: string) => void;
  setAddress: (address: string) => void;
  /**
   * Android: advertise a stable Bluetooth tag so iPhones can measure distance
   * to this phone. Costs privacy: any scanner can follow the phone by it.
   */
  advertiseNodeHash: boolean;
  setAdvertiseNodeHash: (on: boolean) => void;
};

export const useProfile = create<ProfileState>()(
  persist(
    set => ({
      name: null,
      color: MEMBER_COLORS[0],
      address: null,
      setProfile: (name, color) => set({ name: name.trim(), color }),
      setAddress: address => set({ address }),
      advertiseNodeHash: false,
      setAdvertiseNodeHash: on => set({ advertiseNodeHash: on }),
    }),
    { name: 'profile', storage: persistStorage },
  ),
);
