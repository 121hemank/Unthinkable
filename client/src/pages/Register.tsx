import { FormEvent, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
export default function Register() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        try {
            await register(name, email, password, "patient");
            navigate("/");
        }
        catch (err: any) {
            setError(err?.response?.data?.error || "Registration failed");
        }
    }
    return (<div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="flex items-center gap-3 mb-6">
        <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-cyan-500 text-white flex items-center justify-center font-extrabold text-lg shadow-lg shadow-teal-600/30">C</span>
        <div>
          <p className="text-lg font-semibold text-slate-900">Clinic Appointment Manager</p>
          <p className="text-sm text-slate-500">Create your patient account</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-xl shadow-slate-300/40 ring-1 ring-slate-200/70">
        <h1 className="text-xl font-semibold text-slate-900 mb-6">Create account</h1>
        {error && <p className="text-sm text-urgency-high mb-4">{error}</p>}
        <label className="block text-sm text-slate-600 mb-1">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full mb-4 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" required/>
        <label className="block text-sm text-slate-600 mb-1">Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full mb-4 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" required/>
        <label className="block text-sm text-slate-600 mb-1">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full mb-4 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" required/>
        <p className="text-xs text-slate-500 mb-6 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          You're signing up as a <strong>patient</strong>. Clinician accounts are
          created by the clinic admin — contact the front desk if you're a doctor.
        </p>
        <button type="submit" className="w-full bg-primary hover:bg-primary-dark text-white py-2 rounded-lg font-medium">
          Create account
        </button>
        <p className="text-sm text-slate-500 mt-4">
          Already have an account? <Link to="/login" className="text-primary font-medium">Sign in</Link>
        </p>
      </form>
    </div>);
}
