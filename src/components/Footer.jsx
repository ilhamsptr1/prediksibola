import React from 'react';
import { Instagram, Github } from 'lucide-react';
import { isNativePlatform } from '@capacitor/core';
import './Footer.css';

const Footer = () => {
  const openLink = (url) => {
    // If native Android, use _system to open in external browser app
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
      window.open(url, '_system');
    } else {
      window.open(url, '_blank', 'noopener noreferrer');
    }
  };

  return (
    <footer className="glass-footer">
      <div className="footer-content">
        <div className="footer-copyright">
          <span>&copy; {new Date().getFullYear()} Ilham Saputra</span>
        </div>
        <div className="footer-socials">
          <button 
            className="social-btn glass-btn" 
            onClick={() => openLink('https://www.instagram.com/ilhammsptra_/')}
            aria-label="Instagram"
          >
            <Instagram size={18} />
          </button>
          <button 
            className="social-btn glass-btn" 
            onClick={() => openLink('https://github.com/ilhamsptr1')}
            aria-label="GitHub"
          >
            <Github size={18} />
          </button>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
