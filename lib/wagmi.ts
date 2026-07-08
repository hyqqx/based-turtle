import { http, createConfig } from "wagmi";
import { base } from "wagmi/chains";
import { baseAccount, injected } from "wagmi/connectors";

export const config = createConfig({
  chains: [base],
  connectors: [injected(), baseAccount({ appName: "Based Turtle" })],
  ssr: true,
  transports: {
    [base.id]: http(),
  },
});
