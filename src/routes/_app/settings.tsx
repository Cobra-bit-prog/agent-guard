import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { getProfile, saveProfile } from "@/lib/server/guard";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const user = useCurrentUser();
  const q = useQuery({ queryKey: ["profile"], queryFn: () => getProfile() });
  const [telegram, setTelegram] = useState("");
  const [emailOn, setEmailOn] = useState(true);
  const [tgOn, setTgOn] = useState(false);
  const [webhook, setWebhook] = useState("");

  useEffect(() => {
    if (!q.data) return;
    setTelegram(q.data.telegram_chat_id);
    setEmailOn(q.data.email_alerts);
    setTgOn(q.data.telegram_alerts);
    setWebhook(q.data.webhook_url ?? "");
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      saveProfile({
        data: {
          telegram_chat_id: telegram,
          email_alerts: emailOn,
          telegram_alerts: tgOn,
          webhook_url: webhook,
        },
      }),
    onSuccess: () => toast.success("Preferences saved"),
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <Skeleton className="h-64" />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted">Profile and notification channels.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{user?.displayName}</p>
          <p className="text-muted">{user?.primaryEmail}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Email alerts</p>
              <p className="text-xs text-muted">Send policy events to your account email.</p>
            </div>
            <Switch checked={emailOn} onCheckedChange={setEmailOn} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Telegram alerts</p>
              <p className="text-xs text-muted">Route critical events to a chat ID.</p>
            </div>
            <Switch checked={tgOn} onCheckedChange={setTgOn} />
          </div>
          <div className="space-y-1.5">
            <Label>Telegram chat ID</Label>
            <Input
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
              placeholder="123456789"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Webhook URL (https)</Label>
            <Input
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
              placeholder="https://example.com/hooks/agent-guard"
            />
            <p className="text-xs text-subtle">
              Stored for later delivery. The console does not POST to this URL from
              the preview (avoids sending fleet data to an unknown host).
            </p>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save
          </Button>
        </CardContent>
      </Card>
      {q.data?.notices && q.data.notices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Notification queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {q.data.notices.map((n) => (
              <div key={n.id} className="flex justify-between gap-3">
                <p>
                  <span className="text-subtle">{n.channel}</span> · {n.message}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
