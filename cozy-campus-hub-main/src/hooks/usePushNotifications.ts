import { useEffect, useCallback } from 'react';
import { PushNotifications, Token, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/hooks/useUser';
import { toast } from '@/hooks/use-toast';

export const usePushNotifications = () => {
    const { user } = useUser();

    const saveTokenToDatabase = useCallback(async (token: string) => {
        if (!user?.id) return;

        try {
            const { error } = await supabase
                .from('profiles')
                .update({ fcm_token: token })
                .eq('id', user.id);

            if (error) throw error;
        } catch (err) {
            console.error('Failed to sync push notification token:', err);
        }
    }, [user?.id]);

    const registerPush = useCallback(async () => {
        if (!Capacitor.isNativePlatform()) {
            return;
        }

        try {
            // 1. Request Permission
            let permStatus = await PushNotifications.checkPermissions();

            if (permStatus.receive === 'prompt') {
                permStatus = await PushNotifications.requestPermissions();
            }

            if (permStatus.receive !== 'granted') {
                return;
            }

            // 2. Add Listeners
            await PushNotifications.addListener('registration', (token: Token) => {
                saveTokenToDatabase(token.value);
            });

            await PushNotifications.addListener('registrationError', (error: any) => {
                console.error('Error on registration: ' + JSON.stringify(error));
            });

            await PushNotifications.addListener('pushNotificationReceived', (notification) => {
                toast({
                    title: notification.title || 'New Notification',
                    description: notification.body || 'You have a new message.',
                });
            });

            await PushNotifications.addListener('pushNotificationActionPerformed', (_notification: ActionPerformed) => {});

            // 3. Register with FCM
            await PushNotifications.register();

        } catch (error) {
            console.error('Push notification registration error:', error);
        }
    }, [saveTokenToDatabase]);

    useEffect(() => {
        if (user?.id) {
            registerPush();
        }

        return () => {
            if (Capacitor.isNativePlatform()) {
                PushNotifications.removeAllListeners();
            }
        };
    }, [user?.id, registerPush]);

    return { registerPush };
};
