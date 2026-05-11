import * as Notifications from 'expo-notifications';

export class PushNotif {
  async register(): Promise<string | null> {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return null;
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    return token;
  }

  async setBadge(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  }
}
