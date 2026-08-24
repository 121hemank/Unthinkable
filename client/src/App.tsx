import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import PatientDashboard from "./pages/patient/PatientDashboard";
import DoctorDashboard from "./pages/doctor/DoctorDashboard";
import AdminDashboard from "./pages/admin/AdminDashboard";
function HomeRedirect() {
    const { user } = useAuth();
    if (!user)
        return <Navigate to="/login" replace/>;
    if (user.role === "patient")
        return <Navigate to="/patient" replace/>;
    if (user.role === "doctor")
        return <Navigate to="/doctor" replace/>;
    return <Navigate to="/admin" replace/>;
}
export default function App() {
    return (<BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />}/>
          <Route path="/register" element={<Register />}/>
          <Route path="/" element={<HomeRedirect />}/>
          <Route path="/patient" element={<ProtectedRoute allowedRoles={["patient"]}>
                <PatientDashboard />
              </ProtectedRoute>}/>
          <Route path="/doctor" element={<ProtectedRoute allowedRoles={["doctor"]}>
                <DoctorDashboard />
              </ProtectedRoute>}/>
          <Route path="/admin" element={<ProtectedRoute allowedRoles={["admin"]}>
                <AdminDashboard />
              </ProtectedRoute>}/>
          
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>
      </AuthProvider>
    </BrowserRouter>);
}
