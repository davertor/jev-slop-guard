import '../popup/style.css';
import { mountSettingsPage } from '../../lib/settings-ui';

document.body.style.maxWidth = '520px';
document.body.style.margin = '24px auto';
void mountSettingsPage(document.querySelector('#app')!);
