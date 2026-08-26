import { FormEvent, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        try {
            await login(email, password);
            navigate("/");
        }
        catch (err: any) {
            setError(err?.response?.data?.error || (err?.response ? "Login failed" : "Cannot reach server — is it running?"));
        }
    }
    return (<div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="flex items-center gap-3 mb-6">
        <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-cyan-500 text-white flex items-center justify-center font-extrabold text-lg shadow-lg shadow-teal-600/30">C</span>
        <div>
          <p className="text-lg font-bold tracking-tight text-slate-900">Clinic Appointment Manager</p>
          <p className="text-sm text-slate-500">Book, consult and follow up — in one place</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-xl shadow-slate-300/40 ring-1 ring-slate-200/70">
        <h1 className="text-xl font-semibold text-slate-900 mb-6">Sign in</h1>
        {error && <p className="text-sm text-urgency-high mb-4">{error}</p>}
        <label className="block text-sm text-slate-600 mb-1">Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full mb-4 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" required/>
        <label className="block text-sm text-slate-600 mb-1">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full mb-6 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" required/>
        <button type="submit" className="w-full bg-primary hover:bg-primary-dark text-white py-2 rounded-lg font-medium">
          Sign in
        </button>
        <p className="text-sm text-slate-500 mt-4">
          New patient? <Link to="/register" className="text-primary font-medium">Create an account</Link>
        </p>
      </form>
      <button onClick={() => { setEmail("admin@clinic.com"); setPassword("Admin@123"); }} className="mt-4 text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2">
        Reviewer? Click to fill the demo admin login
      </button>
    </div>);
}
