async function connect() {

  if (!window.ethereum) {
    throw new Error(
      "Please install MetaMask"
    );
  }

  const accounts =
    await window.ethereum.request({
      method:
        "eth_requestAccounts",
    });

  const address =
    accounts[0];

  const { message } =
    await api.post(
      "/auth/challenge",
      { address }
    );

  const signature =
    await window.ethereum.request({
      method:
        "personal_sign",
      params: [
        message,
        address,
      ],
    });

  const result =
    await api.post(
      "/auth/verify",
      {
        address,
        message,
        signature,
      }
    );

  localStorage.setItem(
    "medchain_token",
    result.token
  );

  localStorage.setItem(
    "medchain_actor",
    JSON.stringify({
      address,
    })
  );

  setActor({
    address,
  });
}