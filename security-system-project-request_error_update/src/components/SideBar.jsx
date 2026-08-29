import { Home, LayoutDashboard, ShieldAlert, FileText, Settings } from 'lucide-react';
export const SideBar = ({ onNavigate, currentPage }) => {
    return (
        <div className="sidebar">
            <div className="icon-container">
                <img 
                src="src/assets/companyicon.png" 
                alt="Security"
                className="app-icon" />
            </div>

        <nav className="nav-menu">
            <div className={`sidebar-item ${currentPage === 'dashboard' ? 'active' : ''}`}
                    onClick={() => onNavigate('dashboard')}>  
                    <Home size={20} color="#fafafa" />
                    <span>Dashboard</span> 
            </div>
            <div 
                    className={`sidebar-item ${currentPage === 'incidents' ? 'active' : ''}`}
                    onClick={() => onNavigate('incidents')}>           
                    <ShieldAlert size={20} color="#fafafa" />
                    <span>Incident Feed</span>
            </div>
            <div 
                    className={`sidebar-item ${currentPage === 'analytics' ? 'active' : ''}`}
                    onClick={() => onNavigate('analytics')}>
               
                    <FileText size={20} color="#fafafa" />
                    <span>Analytics and Reports</span>
            </div>
            <div 
                    className={`sidebar-item ${currentPage === 'settings' ? 'active' : ''}`}
                    onClick={() => onNavigate('settings')}
                >
                    <Settings size={20} color="#fafafa" />
                    <span>Settings</span>
                </div>
      </nav> 
        </div>
    );
};