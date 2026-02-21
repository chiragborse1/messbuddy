import { useEffect, useCallback } from 'react';
import { PushNotifications, Token, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';
import { toast } from '@/hooks/use-toast';

export const usePushNotifications = () => {
    const { user } = useUser();

    const registerPush = useCallback(async () => {
        if (!Capacitor.isNativePlatform()) {
            console.log('Push notifications not available in browser');
            return;
        }

        try {
            // 1. Request Permission
            let permStatus = await PushNotifications.checkPermissions();

            if (permStatus.receive === 'prompt') {
                permStatus = await PushNotifications.requestPermissions();
            }

            if (permStatus.receive !== 'granted') {
                console.log('User denied push permissions');
                return;
            }

            // 2. Add Listeners
            await PushNotifications.addListener('registration', (token: Token) => {
                console.log('Push registration success, token: ' + token.value);
                saveTokenToDatabase(token.value);
            });

            await PushNotifications.addListener('registrationError', (error: any) => {
                console.error('Error on registration: ' + JSON.stringify(error));
            });

            await PushNotifications.addListener('pushNotificationReceived', (notification) => {
                console.log('Push received: ' + JSON.stringify(notification));
                toast({
                    title: notification.title || 'New Notification',
                    description: notification.body || 'You have a new message.',
                });
            });

            await PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
                console.log('Push action performed: ' + JSON.stringify(notification));
            });

            // 3. Register with FCM
            await PushNotifications.register();

        } catch (error) {
            console.error('Push notification registration error:', error);
        }
    }, [user?.id]);

    const saveTokenToDatabase = async (token: string) => {
        if (!user?.id) return;

        try {
            const { error } = await supabase
                .from('profiles')
                .update({ fcm_token: token })
                .eq('id', user.id);

            if (error) throw error;
            console.log('FCM Token synced to profile');
        } catch (err) {
            console.error('Failed to sync FCM Token:', err);
        }
    };

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
