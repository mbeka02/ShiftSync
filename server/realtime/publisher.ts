import Pusher from "pusher";

let pusher: Pusher | undefined;

function requireEnvironmentValue(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required to publish Pusher events.`);
  }

  return value;
}

function getPusher(): Pusher {
  if (!pusher) {
    pusher = new Pusher({
      appId: requireEnvironmentValue("PUSHER_APP_ID"),
      key: requireEnvironmentValue("NEXT_PUBLIC_PUSHER_APP_KEY"),
      secret: requireEnvironmentValue("PUSHER_SECRET"),
      cluster: requireEnvironmentValue("NEXT_PUBLIC_PUSHER_CLUSTER"),
      useTLS: true,
    });
  }

  return pusher;
}

export async function publishEvent(
  channel: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await getPusher().trigger(channel, event, payload);
}
