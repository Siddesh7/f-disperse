"use client";

import { useState, useEffect } from "react";
import { Plus, Check, Wallet } from "lucide-react";
import { useAccount, useBalance, useWriteContract } from "wagmi";
import { formatEther, parseUnits } from "viem";
import axios from "axios";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trimAddress } from "@/lib/utils";
import { usePrivy } from "@privy-io/react-auth";
import WalletConnector from "./wallet-connector";

// Types
interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  balance: string;
  logo: string;
}

interface Recipient {
  username: string;
  amount: string;
}

// MultiDisperse contract ABI
const MultiDisperseABI = [
  {
    name: "disperseEther",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "recipients", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    name: "disperseToken",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "recipients", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;

// ERC20 ABI
const ERC20ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

// Replace with your deployed contract address on Base Mainnet
const MULTI_DISPERSE_ADDRESS =
  "0xBF6442be44d6e5Ca169AD4E4bD443327388B6641" as const;

// Alchemy API Key (set in .env as NEXT_PUBLIC_ALCHEMY_API_KEY)
const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const ALCHEMY_URL = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

// Neynar API Key (set in .env as NEXT_PUBLIC_NEYNAR_API_KEY)
const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;

// Helper function to fetch token data from CoinGecko (returns null if not listed)
const fetchTokenDataFromCoinGecko = async (
  contractAddress: string
): Promise<{ logo: string; symbol: string; name: string } | null> => {
  try {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/coins/base/contract/${contractAddress.toLowerCase()}`
    );
    return {
      logo: response.data.image?.small || null,
      symbol: response.data.symbol.toUpperCase(),
      name: response.data.name,
    };
  } catch (error) {
    console.error(`Token ${contractAddress} not found on CoinGecko:`, error);
    return null; // Return null if the token isn't listed on CoinGecko
  }
};

export default function TokenDispersal() {
  const { address, isConnected } = useAccount();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [currentUsername, setCurrentUsername] = useState<string>("");
  const [currentAmount, setCurrentAmount] = useState<string>("");
  const [equalDistribution, setEqualDistribution] = useState<boolean>(false);
  const [totalAmount, setTotalAmount] = useState<string>("");
  const [showFeedbackModal, setShowFeedbackModal] = useState<boolean>(false);
  const [transactionStatus, setTransactionStatus] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [isApproved, setIsApproved] = useState<boolean>(false); // New state to track approval

  // Fetch ETH balance (Base Mainnet uses ETH as native token)
  const { data: ethBalance } = useBalance({ address, chainId: 8453 }); // Base Mainnet chain ID
  const { authenticated } = usePrivy();

  // Fetch token balances using Alchemy API and filter by CoinGecko listing
  useEffect(() => {
    if (authenticated && isConnected && address) {
      const fetchTokenBalances = async () => {
        try {
          setIsLoading(true);
          const response = await axios.post(ALCHEMY_URL, {
            jsonrpc: "2.0",
            method: "alchemy_getTokenBalances",
            params: [address, "erc20"],
            id: 1,
          });
          const tokenBalances: {
            contractAddress: string;
            tokenBalance: string;
          }[] = response.data.result.tokenBalances;

          // Fetch token metadata and filter by CoinGecko listing
          const tokenData = await Promise.all(
            tokenBalances.map(async (token) => {
              const metadataResponse = await axios.post(ALCHEMY_URL, {
                jsonrpc: "2.0",
                method: "alchemy_getTokenMetadata",
                params: [token.contractAddress],
                id: 1,
              });
              const metadata: {
                symbol: string;
                name: string;
                decimals: number;
                logo?: string;
              } = metadataResponse.data.result;

              // Check if token is listed on CoinGecko
              const coinGeckoData = await fetchTokenDataFromCoinGecko(
                token.contractAddress
              );
              if (!coinGeckoData) return null; // Skip if not listed on CoinGecko

              const balance =
                parseInt(token.tokenBalance, 16) /
                Math.pow(10, metadata.decimals || 18);
              return {
                symbol: coinGeckoData.symbol,
                name: coinGeckoData.name,
                address: token.contractAddress,
                decimals: metadata.decimals || 18,
                balance: balance.toFixed(4),
                logo:
                  coinGeckoData.logo ||
                  "https://cryptologos.cc/logos/default.png",
              };
            })
          );

          // Filter out null values (tokens not listed on CoinGecko) and tokens with zero balance
          const validTokens = tokenData
            .filter((token): token is Token => token !== null)
            .filter((token) => parseFloat(token.balance) > 0);

          // Add ETH to the token list
          const ethToken: Token = {
            symbol: "ETH",
            name: "Ethereum",
            address: "0x0000000000000000000000000000000000000000",
            decimals: 18,
            balance: ethBalance
              ? Number(formatEther(ethBalance.value)).toFixed(4)
              : "0",
            logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png",
          };

          const filteredTokens = [ethToken, ...validTokens];
          setTokens(filteredTokens);
          setSelectedToken(
            filteredTokens.length > 0 ? filteredTokens[0] : null
          );
        } catch (error) {
          console.error("Error fetching token balances:", error);
        } finally {
          setIsLoading(false);
        }
      };
      fetchTokenBalances();
    } else {
      setTokens([]);
      setSelectedToken(null);
    }
  }, [authenticated, isConnected, address, ethBalance]);

  // Reset approval status when token or recipients change
  useEffect(() => {
    setIsApproved(false);
  }, [selectedToken, recipients, totalAmount]);

  // Fetch wallet address from Neynar when username starts with @
  const resolveUsernameToAddress = async (
    username: string
  ): Promise<string | null> => {
    if (username.startsWith("@")) {
      try {
        const response = await axios.get(
          `https://api.neynar.com/v2/farcaster/user/by_username?username=${username.slice(
            1
          )}`,
          {
            headers: {
              accept: "application/json",
              "x-api-key": NEYNAR_API_KEY,
              "x-neynar-experimental": "false",
            },
          }
        );
        const user: { verifications: string[]; custody_address: string } =
          response.data.user;
        return user.verifications[0] || user.custody_address; // Use first verified address or custody address
      } catch (error) {
        console.error("Error fetching Neynar user:", error);
        alert("Could not resolve username to address");
        return null;
      }
    }
    return username; // Return as-is if not a username
  };

  // Equal distribution logic
  useEffect(() => {
    if (equalDistribution && recipients.length > 0 && totalAmount) {
      const equalAmount = (parseFloat(totalAmount) / recipients.length).toFixed(
        6
      );
      const updatedRecipients = recipients.map((recipient) => ({
        ...recipient,
        amount: equalAmount,
      }));
      setRecipients(updatedRecipients);
    }
  }, [equalDistribution, totalAmount, recipients.length]);

  const addRecipient = async () => {
    if (!currentUsername) return;
    const resolvedAddress = await resolveUsernameToAddress(currentUsername);
    if (resolvedAddress && /^0x[a-fA-F0-9]{40}$/.test(resolvedAddress)) {
      let amount = "0";
      if (equalDistribution && totalAmount) {
        const newRecipientCount = recipients.length + 1;
        amount = (parseFloat(totalAmount) / newRecipientCount).toFixed(6);
        const updatedRecipients = recipients.map((recipient) => ({
          ...recipient,
          amount,
        }));
        setRecipients([
          ...updatedRecipients,
          { username: resolvedAddress, amount },
        ]);
      } else {
        setRecipients([
          ...recipients,
          { username: resolvedAddress, amount: currentAmount || "0" },
        ]);
      }
      setCurrentUsername("");
      setCurrentAmount("");
    } else {
      alert("Invalid address or username resolution failed");
    }
  };

  const removeRecipient = (index: number) => {
    const newRecipients = [...recipients];
    newRecipients.splice(index, 1);
    setRecipients(newRecipients);
  };

  const calculateTotal = (): number => {
    if (equalDistribution && totalAmount) return parseFloat(totalAmount);
    return recipients.reduce(
      (sum, recipient) => sum + (parseFloat(recipient.amount) || 0),
      0
    );
  };

  // Function to clear all form-related states
  const clearFormStates = () => {
    setRecipients([]);
    setCurrentUsername("");
    setCurrentAmount("");
    setTotalAmount("");
    setEqualDistribution(false);
    setIsApproved(false); // Reset approval state
  };

  const { writeContract: approveTokens } = useWriteContract();
  const { writeContract: disperseTokens } = useWriteContract();

  const handleApprove = async () => {
    if (!isConnected || !selectedToken)
      return alert("Please connect your wallet and select a token");
    setIsLoading(true);
    const total = calculateTotal();
    const amountStr = total.toFixed(selectedToken.decimals).toString();
    console.log("Approving amount:", amountStr);

    approveTokens(
      {
        address: selectedToken.address as `0x${string}`,
        abi: ERC20ABI,
        functionName: "approve",
        args: [
          MULTI_DISPERSE_ADDRESS,
          parseUnits(amountStr, selectedToken.decimals),
        ],
      },
      {
        onSuccess: (hash) => {
          setTransactionStatus("Approval sent successfully");
          setTxHash(hash);
          setIsLoading(false);
          setIsApproved(true); // Set approval as complete
          // Note: We don't show the modal here anymore
        },
        onError: (error: any) => {
          console.error("Approval error:", error);
          if (error.code === 4001 || error.message.includes("rejected")) {
            setTransactionStatus("Approval rejected by user");
          } else {
            setTransactionStatus(`Approval failed: ${error.message}`);
          }
          setShowFeedbackModal(true);
          setIsLoading(false);
        },
      }
    );
  };

  const handleDisperse = async () => {
    if (!isConnected || !selectedToken)
      return alert("Please connect your wallet and select a token");
    setIsLoading(true);

    const recipientAddresses = recipients.map(
      (r) => r.username
    ) as `0x${string}`[];
    const amounts = recipients.map((r) => {
      const amount = parseFloat(r.amount);
      const amountStr = amount.toFixed(selectedToken.decimals).toString();
      console.log(`Parsing amount ${r.amount} to ${amountStr}`);
      return parseUnits(amountStr, selectedToken.decimals);
    });

    if (selectedToken.symbol === "ETH") {
      const total = calculateTotal();
      const totalStr = total.toFixed(18).toString();
      console.log("Disperse ETH total:", totalStr);
      disperseTokens(
        {
          address: MULTI_DISPERSE_ADDRESS,
          abi: MultiDisperseABI,
          functionName: "disperseEther",
          args: [recipientAddresses, amounts],
          value: parseUnits(totalStr, 18),
        },
        {
          onSuccess: (hash) => {
            setTransactionStatus("Transaction sent successfully");
            setTxHash(hash);
            setShowFeedbackModal(true); // Show modal only after disperse
            setIsLoading(false);
            clearFormStates(); // Clear all form states after success
          },
          onError: (error: any) => {
            console.error("Disperse error:", error);
            if (error.code === 4001 || error.message.includes("rejected")) {
              setTransactionStatus("Transaction rejected by user");
            } else {
              setTransactionStatus(`Transaction failed: ${error.message}`);
            }
            setShowFeedbackModal(true); // Show modal on error
            setIsLoading(false);
          },
        }
      );
    } else {
      console.log("Disperse token recipients:", recipientAddresses);
      console.log("Disperse token amounts:", amounts);
      disperseTokens(
        {
          address: MULTI_DISPERSE_ADDRESS,
          abi: MultiDisperseABI,
          functionName: "disperseToken",
          args: [
            selectedToken.address as `0x${string}`,
            recipientAddresses,
            amounts,
          ],
        },
        {
          onSuccess: (hash) => {
            setTransactionStatus("Transaction sent successfully");
            setTxHash(hash);
            setShowFeedbackModal(true); // Show modal only after disperse
            setIsLoading(false);
            clearFormStates(); // Clear all form states after success
          },
          onError: (error: any) => {
            console.error("Disperse error:", error);
            if (error.code === 4001 || error.message.includes("rejected")) {
              setTransactionStatus("Transaction rejected by user");
            } else {
              setTransactionStatus(`Transaction failed: ${error.message}`);
            }
            setShowFeedbackModal(true); // Show modal on error
            setIsLoading(false);
          },
        }
      );
    }
  };

  return (
    <div className="container mx-auto py-6">
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Disperse Tokens</CardTitle>
              <CardDescription>
                Send tokens to multiple recipients at once (Base Mainnet)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="token">Select Token</Label>
            <Select
              value={selectedToken?.symbol || ""}
              onValueChange={(value) => {
                if (value && value.trim() !== "") {
                  setSelectedToken(
                    tokens.find((t) => t.symbol === value) || null
                  );
                }
              }}
              disabled={tokens.length === 0}
            >
              <SelectTrigger id="token" className="w-full">
                <SelectValue
                  placeholder={
                    !authenticated
                      ? "Please authenticate to load tokens"
                      : isLoading
                      ? "Loading tokens..."
                      : tokens.length === 0
                      ? "No tokens available"
                      : "Select a token"
                  }
                />
              </SelectTrigger>
              {tokens.length > 0 && (
                <SelectContent>
                  {tokens.map((token) => (
                    <SelectItem
                      key={token.address}
                      value={token.symbol || `token-${token.address}`}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className="flex items-center gap-2">
                          <img
                            src={token.logo}
                            alt={token.symbol || "Token"}
                            className="w-5 h-5"
                          />
                          {token.symbol || "Unknown"} -{" "}
                          {token.name || "Unnamed Token"}
                        </span>
                        <span className="text-muted-foreground">
                          {token.balance}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              )}
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="equal"
              checked={equalDistribution}
              onCheckedChange={() => setEqualDistribution(!equalDistribution)}
            />
            <Label htmlFor="equal">
              Distribute equally among all recipients
            </Label>
          </div>

          {equalDistribution && (
            <div className="space-y-2">
              <Label htmlFor="totalAmount">Total Amount to Distribute</Label>
              <Input
                id="totalAmount"
                placeholder="Enter total amount"
                type="number"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Add Recipient (Address or @username)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="0x... or @username"
                value={currentUsername}
                onChange={(e) => setCurrentUsername(e.target.value)}
                className="flex-1"
              />
              {!equalDistribution && (
                <Input
                  placeholder="Amount"
                  type="number"
                  value={currentAmount}
                  onChange={(e) => setCurrentAmount(e.target.value)}
                  className="w-1/3"
                />
              )}
              <Button variant="outline" size="icon" onClick={addRecipient}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {recipients.length > 0 && (
            <div className="space-y-2">
              <Label>Recipients</Label>
              <div className="border rounded-md divide-y">
                {recipients.map((recipient, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center p-3"
                  >
                    <div className="font-medium">
                      {trimAddress(recipient.username)}
                    </div>
                    <div className="flex items-center gap-2">
                      <div>
                        {recipient.amount} {selectedToken?.symbol}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => removeRecipient(index)}
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recipients.length > 0 && (
            <div className="flex justify-between items-center pt-4 border-t">
              <span className="font-medium">Total Amount:</span>
              <span className="font-bold text-lg">
                {calculateTotal().toFixed(6)} {selectedToken?.symbol}
              </span>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end">
          {selectedToken?.symbol === "ETH" ? (
            <Button
              onClick={handleDisperse}
              disabled={!isConnected || recipients.length === 0 || isLoading}
              className="w-full"
            >
              {isLoading ? "Processing..." : "Disperse Tokens"}
            </Button>
          ) : !isApproved ? (
            <Button
              onClick={handleApprove}
              disabled={!isConnected || recipients.length === 0 || isLoading}
              className="w-full"
            >
              {isLoading
                ? "Processing..."
                : `Approve ${selectedToken?.symbol || ""}`}
            </Button>
          ) : (
            <Button
              onClick={handleDisperse}
              disabled={!isConnected || recipients.length === 0 || isLoading}
              className="w-full"
            >
              {isLoading ? "Processing..." : "Disperse Tokens"}
            </Button>
          )}
        </CardFooter>
      </Card>

      <Dialog open={showFeedbackModal} onOpenChange={setShowFeedbackModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transaction Status</DialogTitle>
            <DialogDescription>{transactionStatus}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-6">
            {transactionStatus.includes("successfully") ? (
              <div className="rounded-full bg-primary/10 p-3">
                <Check className="h-8 w-8 text-primary" />
              </div>
            ) : (
              <div className="rounded-full bg-destructive/10 p-3">
                <span className="text-destructive text-2xl font-bold">!</span>
              </div>
            )}
          </div>
          {txHash && transactionStatus.includes("successfully") && (
            <div className="text-center">
              <a
                href={`https://basescan.org/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                View Transaction on BaseScan
              </a>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => {
                setShowFeedbackModal(false);
                setTxHash(null); // Clear txHash when closing the modal
              }}
              className="w-full"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
