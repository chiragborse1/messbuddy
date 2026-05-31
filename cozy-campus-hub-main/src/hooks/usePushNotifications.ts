import { useEffect, useCallback } from 'react';
import { PushNotifications, Token, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
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

            // Register with FCM. Listeners are managed in the effect below.
            await PushNotifications.register();

        } catch (error) {
            console.error('Push notification registration error:', error);
        }
    }, []);

    useEffect(() => {
        if (!user?.id || !Capacitor.isNativePlatform()) {
            return;
        }

        let active = true;
        const listenerHandles: PluginListenerHandle[] = [];

        const addListeners = async () => {
            listenerHandles.push(
                await PushNotifications.addListener('registration', (token: Token) => {
                    saveTokenToDatabase(token.value);
                }),
                await PushNotifications.addListener('registrationError', (error: any) => {
                    console.error('Error on registration: ' + JSON.stringify(error));
                }),
                await PushNotifications.addListener('pushNotificationReceived', (notification) => {
                    toast({
                        title: notification.title || 'New Notification',
                        description: notification.body || 'You have a new message.',
                    });
                }),
                await PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
                    const route = notification.notification.data?.route;
                    if (typeof route === 'string' && route.startsWith('/')) {
                        window.location.assign(route);
                    }
                }),
            );

            if (active) await registerPush();
        };

        void addListeners();

        return () => {
            active = false;
            listenerHandles.forEach((handle) => {
                void handle.remove();
            });
        };
    }, [registerPush, saveTokenToDatabase, user?.id]);

    return { registerPush };
};
