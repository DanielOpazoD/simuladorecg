// Keep the existing application owners. This layer changes only DOM interaction.
import './main';
import './ui/accessibility.css';
import './ui/workspace.css';
import './ui/paper-first.css';
import './ui/reading-dialogs.css';
import { installAccessibility } from './ui/accessibility';
installAccessibility();
