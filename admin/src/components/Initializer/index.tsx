import { useEffect, useRef } from 'react';
import pluginId from '../../pluginId';

type InitializerProps = {
  setPlugin: (pluginId: string) => void;
};

export default function Initializer({ setPlugin }: InitializerProps) {
  const ref = useRef(setPlugin);

  useEffect(() => {
    ref.current(pluginId);
  }, []);

  return null;
}
