import {
  createContext,
  useContext,
  useEffect,
  useState
} from "react";

import { api } from "./api";

const Ctx = createContext({
  actor: null,
  connected: false,
  loading: false,
  connect: async () => {},
  logout: () => {}
});

export const useActor = () => useContext(Ctx);

export function ActorProvider({ children }) {
  const [actor, setActor] = useState(null);
  const [loading, setLoading] = useState(false);

  const connected = Boolean(actor);

  useEffect(() => {
    const savedActor =
      localStorage.getItem("medchain_actor");

    const token =
      localStorage.getItem("medchain_token");

    if (savedActor && token) {
      try {
        setActor(JSON.parse(savedActor));
      } catch {
        localStorage.removeItem("medchain_actor");
        localStorage.removeItem("medchain_token");
      }
    }
  }, []);

  async function connect() {
    if (!window.ethereum) {
      throw new Error(
        "Please install MetaMask"
      );
    }

    setLoading(true);

    try {
      const accounts =
        await window.ethereum.request({
          method: "eth_requestAccounts"
        });

      if (!accounts.length) {
        throw new Error(
          "No wallet account selected"
        );
      }

      const address = accounts[0];

      const challenge =
        await api.post(
          "/auth/challenge",
          { address }
        );

      const signature =
        await window.ethereum.request({
          method: "personal_sign",
          params: [
            challenge.message,
            address
          ]
        });

      const result =
        await api.post(
          "/auth/verify",
          {
            address,
            message: challenge.message,
            signature,
            nonce: challenge.nonce
          }
        );

      const authenticatedActor = {
        address: result.address
      };

      localStorage.setItem(
        "medchain_token",
        result.token
      );

      localStorage.setItem(
        "medchain_actor",
        JSON.stringify(authenticatedActor)
      );

      setActor(authenticatedActor);

      return authenticatedActor;
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(
      "medchain_token"
    );

    localStorage.removeItem(
      "medchain_actor"
    );

    setActor(null);
  }

  return (
    <Ctx.Provider
      value={{
        actor,
        connected,
        loading,
        connect,
        logout
      }}
    >
      {children}
    </Ctx.Provider>
  );
}