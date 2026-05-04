
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { Role, User, Dealer, Admin } from '../types';

interface AuthContextType {
    role: Role | null;
    account: User | Dealer | Admin | null;
    token: string | null;
    loading: boolean;
    verifyData: any;
    login: (id: string, pass: string) => Promise<void>;
    logout: () => void;
    setAccount: React.Dispatch<React.SetStateAction<User | Dealer | Admin | null>>;
    resetPassword: (id: string, contact: string, newPass: string) => Promise<string>;
    fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const parseAccountDates = (acc: any) => {
    if (acc && acc.ledger) {
        acc.ledger = acc.ledger.map((e: any) => ({ ...e, timestamp: new Date(e.timestamp) }));
    }
    return acc;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [role, setRole] = useState<Role | null>(null);
    const [account, setAccount] = useState<User | Dealer | Admin | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('authToken'));
    const [loading, setLoading] = useState<boolean>(true);
    const [verifyData, setVerifyData] = useState<any>(null);

    const logout = useCallback(() => {
        setRole(null); setAccount(null); setToken(null); setVerifyData(null);
        localStorage.removeItem('authToken');
    }, []);
    
    const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}) => {
        const headers = new Headers(options.headers || {});
        const currentToken = token || localStorage.getItem('authToken');
        if (currentToken) headers.append('Authorization', `Bearer ${currentToken}`);
        if (!headers.has('Content-Type') && !(options.body instanceof FormData)) headers.append('Content-Type', 'application/json');
        
        const response = await fetch(url, { ...options, headers });
        if (response.status === 401 || response.status === 403) { logout(); throw new Error('Session expired'); }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Request failed with status ${response.status}`);
        }
        
        return response;
    }, [token, logout]);
    
    useEffect(() => {
        let poll: ReturnType<typeof setInterval>;
        const verify = async () => {
            if (!token) { setLoading(false); return; }
            try {
                const response = await fetch('/api/auth/verify', { headers: { 'Authorization': `Bearer ${token}` } });
                if (!response.ok) throw new Error('Fail');
                const data = await response.json();
                setAccount(parseAccountDates(data.account));
                setRole(data.role);
                setVerifyData(data);
                setLoading(false);

                if (data.role !== Role.Admin) {
                    poll = setInterval(async () => {
                        const r = await fetch('/api/auth/verify', { headers: { 'Authorization': `Bearer ${token}` }});
                        if (r.ok) { const d = await r.json(); setAccount(parseAccountDates(d.account)); }
                        else logout();
                    }, 2000);
                }
            } catch (e) { logout(); setLoading(false); }
        };
        verify();
        return () => poll && clearInterval(poll);
    }, [token, logout]);

    const login = async (id: string, pass: string) => {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loginId: id, password: pass })
        });
        if (!response.ok) throw new Error("Login failed");
        const data = await response.json();
        localStorage.setItem('authToken', data.token);
        setAccount(parseAccountDates(data.account));
        setRole(data.role);
        setToken(data.token);
    };
    
    return (
        <AuthContext.Provider value={{ role, account, token, loading, verifyData, login, logout, setAccount, resetPassword: async (id, c, p) => "Reset logic stub", fetchWithAuth }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('Must use AuthProvider');
    return context;
};
