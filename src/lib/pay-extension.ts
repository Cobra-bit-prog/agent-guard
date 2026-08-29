import { Buffer } from "buffer";
import { EVM_USDC, type EvmPayChain } from "@/lib/evm-pay";
import { USDC_MINT, usdcBaseUnits } from "@/lib/solana-pay";

function ensureNodeBuffer() {
  const g = globalThis as typeof globalThis & {
    Buffer?: typeof Buffer;
    global?: typeof globalThis;
  };
  if (!g.Buffer) g.Buffer = Buffer;
  if (!g.global) g.global = g;
}

ensureNodeBuffer();

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  signAndSendTransaction: (tx: unknown) => Promise<{ signature: string }>;
};

type EthereumProvider = {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function injectedWindow() {
  return window as Window & {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
    ethereum?: EthereumProvider;
  };
}

export function hasPhantomExtension(): boolean {
  if (typeof window === "undefined") return false;
  const w = injectedWindow();
  return Boolean(w.phantom?.solana?.isPhantom || w.solana?.isPhantom);
}

export function hasEthereumExtension(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(injectedWindow().ethereum);
}

function getPhantom(): PhantomProvider {
  const w = injectedWindow();
  const p = w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : undefined);
  if (!p?.isPhantom) throw new Error("Phantom extension is not available.");
  return p;
}

export async function payUsdcWithPhantomExtension(opts: {
  recipient: string;
  amountUsdc: number;
  reference: string;
}): Promise<string> {
  ensureNodeBuffer();
  const {
    PublicKey,
    Transaction,
  } = await import("@solana/web3.js");
  const {
    TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountIdempotentInstruction,
    createTransferInstruction,
    getAssociatedTokenAddress,
  } = await import("@solana/spl-token");

  const phantom = getPhantom();
  const connected = await phantom.connect();
  const payer = new PublicKey(connected.publicKey.toString());
  const destOwner = new PublicKey(opts.recipient);
  const mint = new PublicKey(USDC_MINT);
  const reference = new PublicKey(opts.reference);
  const amount = BigInt(usdcBaseUnits(opts.amountUsdc));

  const sourceAta = await getAssociatedTokenAddress(mint, payer);
  const destAta = await getAssociatedTokenAddress(mint, destOwner);

  const transfer = createTransferInstruction(
    sourceAta,
    destAta,
    payer,
    amount,
    [],
    TOKEN_PROGRAM_ID,
  );
  transfer.keys.push({ pubkey: reference, isSigner: false, isWritable: false });

  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(payer, destAta, destOwner, mint),
    transfer,
  );
  tx.feePayer = payer;
  tx.recentBlockhash = await latestSolanaBlockhash();

  const sent = await phantom.signAndSendTransaction(tx);
  if (!sent?.signature) throw new Error("Phantom did not return a signature.");
  return sent.signature;
}


const BROWSER_SOLANA_RPCS = [
  "https://solana-rpc.publicnode.com",
  "https://solana.drpc.org",
  "https://solana.publicnode.com",
  "https://api.mainnet-beta.solana.com",
];

async function latestSolanaBlockhash(): Promise<string> {
  for (const url of BROWSER_SOLANA_RPCS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getLatestBlockhash",
          params: [{ commitment: "confirmed" }],
        }),
        signal: AbortSignal.timeout(4000),
      });
      const j = (await res.json()) as { result?: { value?: { blockhash?: string } } };
      const hash = j.result?.value?.blockhash;
      if (hash) return hash;
    } catch {
      // try the next public RPC, then our server
    }
  }
  const { getSolanaBlockhash } = await import("@/lib/server/solana-billing");
  const row = await getSolanaBlockhash();
  if (!row?.blockhash) throw new Error("Could not get a recent Solana blockhash. Try Open in Phantom again.");
  return row.blockhash;
}

function padAddress(addr: string): string {

  return addr.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
}

export async function payUsdcWithEthereumExtension(opts: {
  chain: EvmPayChain;
  recipient: string;
  amountBaseUnits: string;
}): Promise<string> {
  const ethereum = injectedWindow().ethereum;
  if (!ethereum) throw new Error("No Ethereum wallet in this browser.");

  const net = EVM_USDC[opts.chain];
  const chainIdHex = `0x${net.chainId.toString(16)}`;
  const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
  const from = accounts?.[0];
  if (!from) throw new Error("No account selected in the wallet.");

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code !== 4902) throw err;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: net.name,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [
            net.chain === "base" ? "https://mainnet.base.org" : "https://ethereum.publicnode.com",
          ],
          blockExplorerUrls: [
            net.chain === "base" ? "https://basescan.org" : "https://etherscan.io",
          ],
        },
      ],
    });
  }

  const data = `0xa9059cbb${padAddress(opts.recipient)}${BigInt(opts.amountBaseUnits).toString(16).padStart(64, "0")}`;
  const hash = await ethereum.request({
    method: "eth_sendTransaction",
    params: [
      {
        from,
        to: net.usdc,
        data,
        chainId: chainIdHex,
      },
    ],
  });
  if (typeof hash !== "string" || !hash) throw new Error("Wallet did not return a transaction hash.");
  return hash;
}

export function walletUserRejected(err: unknown): boolean {
  const code = (err as { code?: number; error?: { code?: number } })?.code
    ?? (err as { error?: { code?: number } })?.error?.code;
  const message = String((err as { message?: string })?.message ?? "");
  return code === 4001 || /user rejected|denied/i.test(message);
}
