
import React from 'react';
import { Role, User, Dealer, Admin } from '../types';

interface AuthScreenProps {
  onLogin: (role: Role, account: User | Dealer | Admin) => void;
  users: User[];
  dealers: Dealer[];
  admin: Admin;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin, users, dealers, admin }) => {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-4xl font-bold text-cyan-400 mb-2">A-Baba Exchange</h1>
        <p className="text-slate-400 mb-8">Digital Lottery Platform</p>

        <div className="bg-slate-800 rounded-lg p-6 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-6">Select Your Role to Login</h2>
          
          <div className="space-y-4">
            <button
              onClick={() => onLogin(Role.Admin, admin)}
              className="w-full text-left p-4 bg-slate-700 hover:bg-red-600 rounded-lg transition-all duration-300 group"
            >
              <p className="font-bold text-lg text-red-400 group-hover:text-white">Admin</p>
              <p className="text-sm text-slate-400 group-hover:text-slate-200">Login as: {admin.name}</p>
            </button>

            {dealers.map(dealer => (
              <button
                key={dealer.id}
                onClick={() => onLogin(Role.Dealer, dealer)}
                className="w-full text-left p-4 bg-slate-700 hover:bg-emerald-600 rounded-lg transition-all duration-300 group"
              >
                <p className="font-bold text-lg text-emerald-400 group-hover:text-white">Dealer</p>
                <p className="text-sm text-slate-400 group-hover:text-slate-200">Login as: {dealer.name}</p>
              </button>
            ))}

            {users.map(user => (
               <button
                key={user.id}
                onClick={() => onLogin(Role.User, user)}
                className="w-full text-left p-4 bg-slate-700 hover:bg-sky-600 rounded-lg transition-all duration-300 group"
              >
                <p className="font-bold text-lg text-sky-400 group-hover:text-white">User</p>
                <p className="text-sm text-slate-400 group-hover:text-slate-200">Login as: {user.name}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
