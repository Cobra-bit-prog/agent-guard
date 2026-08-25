import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ChainMark } from "@/components/chain-icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
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
import { CHAIN_LIST, type ChainId } from "@/lib/chains";
import { createAgent } from "@/lib/server/guard";

export function AddAgentDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState<ChainId>("base");
  const [role, setRole] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      createAgent({ data: { name, address, chain, role: role || undefined } }),
    onSuccess: (r) => {
      toast.success(
        r.api_key
          ? "Live wallet added. Copy the pre-sign key from the agent page."
          : "Agent added",
      );
      setOpen(false);
      setName("");
      setAddress("");
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function connectInjected() {
    try {
      if (chain === "solana") {
        const provider = (window as unknown as { solana?: { connect: () => Promise<{ publicKey: { toString: () => string } }> } }).solana;
        if (!provider) {
          toast.error("No Solana wallet detected (try Phantom). You can paste an address instead.");
          return;
        }
        const res = await provider.connect();
        setAddress(res.publicKey.toString());
        return;
      }
      const eth = (window as unknown as { ethereum?: { request: (a: { method: string }) => Promise<string[]> } }).ethereum;
      if (!eth) {
        toast.error("No injected EVM wallet found. Paste an address instead.");
        return;
      }
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      if (accounts[0]) setAddress(accounts[0]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Wallet request rejected");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add agent</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Monitor an agent wallet</DialogTitle>
        <DialogDescription>
          Connect an injected wallet or paste an address on Base, Ethereum, or Solana.
        </DialogDescription>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-role">Role</Label>
            <Input
              id="agent-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Trading, research…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Chain</Label>
            <Select value={chain} onValueChange={(v) => setChain(v as ChainId)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHAIN_LIST.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="inline-flex items-center gap-2">
                      <ChainMark chain={c.id} className="size-4" />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-address">Wallet address</Label>
            <Input
              id="agent-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              className="font-mono text-xs"
            />
          </div>
          <Button type="button" variant="secondary" className="w-full" onClick={connectInjected}>
            Connect browser wallet
          </Button>
          <Button className="w-full" disabled={mut.isPending}>
            {mut.isPending ? "Saving…" : "Start monitoring"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
