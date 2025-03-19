"use client";

import { useEffect, useState } from "react";
import sdk from "@farcaster/frame-sdk";

import WalletConnector from "./wallet-connector";
import TokenDispersal from "./disperser";
import Navbar from "./navbar";
import Footer from "./footer";

export default function App() {
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [farcasterUserContext, setFarcasterUserContext] = useState<any>();

  useEffect(() => {
    const load = async () => {
      setFarcasterUserContext(await sdk.context);
      sdk.actions.ready();
    };
    if (sdk && !isSDKLoaded) {
      setIsSDKLoaded(true);
      load();
    }
  }, [isSDKLoaded]);

  return (
    <div className="flex flex-col min-h-screen w-[96%] mx-auto">
      <Navbar />
      <main className="flex-grow">
        <TokenDispersal />
      </main>
      <Footer />
    </div>
  );
}
