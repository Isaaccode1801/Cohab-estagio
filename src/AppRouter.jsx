/*
import React from "react";
import { HashRouter, Routes, Route, NavLink, Outlet } from "react-router-dom";
import ExploreScreen from "./ExploreScreen.jsx";   // ajuste o caminho se precisar
import OwnerScreen from "./OwnerScreen.jsx";       // se estão no mesmo App.jsx, veja nota abaixo
import LeadForm from "./components/LeadForm.jsx";

function Header() {
  const baseBtn = "px-3 py-2 rounded-lg hover:bg-gray-100";
  const active  = "text-blue-700 font-semibold";
  return (
    <nav className="flex items-center justify-between bg-white px-4 py-2 border-b">
      <h1 className="font-bold text-xl text-blue-700">Cohab Temporada</h1>
      <div className="flex gap-2">
        <NavLink to="/" end className={({isActive}) => `${baseBtn} ${isActive?active:""}`}>Explorar</NavLink>
        <NavLink to="/owner" className={({isActive}) => `${baseBtn} ${isActive?active:""}`}>Área do Proprietário</NavLink>
        <NavLink to="/lead"  className={({isActive}) => `${baseBtn} ${isActive?active:""}`}>Quero anunciar</NavLink>
      </div>
    </nav>
  );
}

function Layout() {
  return (
    <div className="min-h-dvh bg-gray-50">
      <Header />
      <main className="max-w-6xl mx-auto p-4">
        <Outlet />
      </main>
    </div>
  );
}

export default function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ExploreScreen />} />
          <Route path="/owner" element={<OwnerScreen />} />
          <Route path="/lead"  element={<LeadForm />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
*/