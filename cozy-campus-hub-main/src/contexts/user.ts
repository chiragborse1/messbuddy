import { createContext } from "react";

export interface UserData {
    id: string;
    name: string;
    email: string;
    mobile: string;
    college: string;
    course: string;
    photo?: string;
    role: "student" | "admin" | "developer";
    status?: "active" | "pending" | "expired" | "approved" | "rejected" | "on-leave" | "suspended" | string;
    daysRemaining?: number;
    plan?: string;
    onLeave?: boolean;
    planStartDate?: string;
    planEndDate?: string;
    pendingAmount?: number;
}

export interface UserContextType {
    user: UserData | null;
    loading: boolean;
    login: (userData: UserData) => void;
    logout: () => Promise<void>;
    updateUser: (userData: Partial<UserData>) => Promise<void>;
    refreshProfile: (showToast?: boolean) => Promise<void>;
}

export const UserContext = createContext<UserContextType | undefined>(undefined);
