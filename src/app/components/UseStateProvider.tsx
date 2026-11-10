import { Dispatch, ReactNode, SetStateAction, useState } from 'react';

type UseStateProviderProps<T> = {
  initial: T | (() => T);
  children: (value: T, setter: Dispatch<SetStateAction<T>>) => ReactNode;
};
export function UseStateProvider<T>({ initial, children }: UseStateProviderProps<T>) {
  return children(...useState(initial));
}
