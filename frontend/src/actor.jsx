
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

  function clearSession() {
    localStorage.removeItem("medchain_actor");
    localStorage.removeItem("medchain_token");
    setActor(null);
  }

  // Restore the previous session.
  useEffect(() => {
    const savedActor = localStorage.getItem("medchain_actor");
    const token = localStorage.getItem("medchain_token");

    if (savedActor && token) {
      try {
        setActor(JSON.parse(savedActor));
      } catch {
        clearSession();
      }
    }
  }, []);

  // Handle wallet account and network changes.
  useEffect(() => {
    if (!window.ethereum) return;

    async function handleAccountsChanged(accounts) {
      const currentAddress = actor?.address?.toLowerCase();
      const newAddress = accounts[0]?.toLowerCase();

      if (!newAddress || newAddress !== currentAddress) {
        clearSession();
      }
    }

    function handleChainChanged() {
      clearSession();
    }

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener(
        "accountsChanged",
        handleAccountsChanged
      );

      window.ethereum.removeListener(
        "chainChanged",
        handleChainChanged
      );
    };
  }, [actor?.address]);

  async function connect() {
    if (!window.ethereum) {
      throw new Error("Please install MetaMask");
    }

    setLoading(true);

    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts"
      });

      if (!accounts.length) {
        throw new Error("No wallet account selected");
      }

      const address = accounts[0];

      const challenge = await api.post(
        "/auth/challenge",
        { address }
      );

      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [challenge.message, address]
      });

      const result = await api.post(
        "/auth/verify",
        {
          address,
          message: challenge.message,
          signature,
          nonce: challenge.nonce
        }
      );

      const registeredActors = await api.get("/actors");
      const registeredActor = registeredActors.find(
        (item) =>
          item.address?.toLowerCase() === result.address.toLowerCase()
      );

      const authenticatedActor = {
        address: result.address,
        role: registeredActor?.role ?? null,
        name: registeredActor?.name ?? null
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
    clearSession();
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

