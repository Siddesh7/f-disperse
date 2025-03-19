import WalletConnector from "./wallet-connector";

export default function Navbar() {
  return (
    <nav className="w-full border-b bg-background py-4">
      <div className="container mx-auto flex items-center justify-between px-4">
        <h3 className="text-xl font-bold text-primary">f(disperse)</h3>
        <WalletConnector />
      </div>
    </nav>
  );
}
