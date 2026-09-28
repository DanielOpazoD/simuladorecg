// Keep the existing application owners. This layer changes only DOM interaction.
import './main';
import './ui/accessibility.css';
import './ui/workspace.css';
import { installAccessibility } from './ui/accessibility';
installAccessibility();
