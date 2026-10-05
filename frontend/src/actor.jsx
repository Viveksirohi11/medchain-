// "Acting as" - demo login. Pick which licensed actor you are; the backend signs for them.
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

const Ctx = createContext({ actors: [], actor: null, setActor: () => {} });
export const useActor = () => useContext(Ctx);

export function ActorProvider({ children }) {
  const [actors, setActors] = useState([]);
  const [address, setAddress] = useState(localStorage.getItem("actor") || "");

  useEffect(() => {
    api.get("/actors").then(setActors).catch(() => {});
  }, []);

  const choose = (a) => {
    setAddress(a);
    localStorage.setItem("actor", a);
  };
  const actor = actors.find((x) => x.address === address) || null;
  return <Ctx.Provider value={{ actors, actor, setActor: choose }}>{children}</Ctx.Provider>;
}
