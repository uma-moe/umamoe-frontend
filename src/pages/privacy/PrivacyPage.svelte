<script lang="ts">
  import PageHeading from '@/layouts/PageHeading.svelte';
  import { openFusePrivacyControls } from '@/services/ads/fuse-ads';
  import Banner from '@/components/Banner.svelte';
  import Icon from '@/components/Icon.svelte';
  import SourcePage from '@/layouts/SourcePage.svelte';

  let privacyNotice = $state('');
  const links = [
    ['overview', 'Overview'], ['information-collection', 'Data We Collect'], ['accounts', 'Accounts & Authentication'],
    ['cookies', 'Cookies'], ['advertising', 'Advertising'], ['your-rights', 'Your Rights'],
    ['data-retention', 'Retention'], ['security', 'Security'], ['contact', 'Contact']
  ];

  function scrollToSection(id: string): void { document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }
  function openPrivacyChoices(): void {
    if (!openFusePrivacyControls()) privacyNotice = 'Regional privacy controls are not currently available in this browser or region.';
  }
</script>

<svelte:head>
  <title>Privacy Policy | uma.moe</title>
  <meta name="description" content="Privacy policy for uma.moe - Umamusume resource hub. Learn how your data is handled and protected."/>
  <meta property="og:title" content="Privacy Policy | uma.moe"/>
  <meta property="og:description" content="Privacy policy for uma.moe - Umamusume resource hub. Learn how your data is handled and protected."/>
  <meta property="og:type" content="website"/><meta property="og:url" content="https://uma.moe/privacy-policy"/><meta property="og:image" content="https://uma.moe/assets/logo.webp"/>
  <meta name="twitter:card" content="summary"/><meta name="twitter:title" content="Privacy Policy | uma.moe"/><meta name="twitter:description" content="Privacy policy for uma.moe - Umamusume resource hub."/>
</svelte:head>

<SourcePage routeId="privacy" title="Privacy Policy" width="normal">
  <div class="privacy-page">
    <PageHeading title="Privacy Policy" description="Last updated: October 1, 2026"/>
    <div class="policy-content">
      {#if privacyNotice}<Banner title="Privacy controls" tone="info" dismissible><p>{privacyNotice}</p></Banner>{/if}
      <nav class="quick-nav" aria-label="Privacy policy sections"><strong>Jump to</strong><div>{#each links as link}<button type="button" onclick={() => scrollToSection(link[0]!)}>{link[1]}</button>{/each}</div></nav>

      <section id="overview"><h2><Icon name="info" size={20}/>Overview</h2><p>This Privacy Policy describes how uma.moe ("we," "our," or "us") collects, uses, and protects your information when you use our Umamusume resource hub (the "Service"). We are committed to protecting your privacy and complying with applicable data protection laws, including the EU General Data Protection Regulation (GDPR).</p></section>

      <section id="information-collection"><h2><Icon name="database" size={20}/>Data We Collect</h2>
        <h3>Information You Provide</h3><ul>
          <li><strong>Account Data:</strong> When you sign in via Discord or other OAuth providers, we receive your username and provider ID. We do not receive or store your password.</li>
          <li><strong>Linked Game Accounts:</strong> Trainer IDs you voluntarily link to your account for verification and rankings.</li>
          <li><strong>API Keys:</strong> Keys you generate to access our API programmatically.</li>
          <li><strong>User Preferences:</strong> Filters, settings, and customization choices stored in your browser.</li>
          <li><strong>Carat Planner Data:</strong> When you are signed in, your plans and planner settings are stored with your account so they can sync across devices.</li>
          <li><strong>Shared Plans:</strong> Creating a planner share link stores a separate snapshot that anyone with the link can view and copy. It does not expose your account or grant edit access.</li>
          <li><strong>Self-Contained Plan Links:</strong> When you share while signed out, a compressed copy of the plan is placed in the URL instead of being stored on our server. Anyone with the full link can open that copy.</li>
        </ul>
        <h3>Information Collected Automatically</h3><ul><li><strong>Technical Data:</strong> IP address (for security and rate limiting), browser type, device information.</li><li><strong>Usage Data:</strong> Pages visited, basic navigation patterns - used solely for maintaining the Service.</li><li><strong>Security Logs:</strong> Access logs for abuse prevention, retained for a limited period.</li></ul>
        <h3>Error Monitoring</h3><p>We use Sentry to diagnose application errors and performance problems. Reports include error messages, stack traces, browser details, application versions, and sampled page and request timings. The browser integration is configured to omit account identifiers, cookies, request headers and bodies, and URL query values. We also remove URL fragments from reported request URLs. Session replay is not enabled. See <a href="https://sentry.io/privacy/" target="_blank" rel="noopener">Sentry's privacy policy</a> for information about the provider.</p>
        <h3>What We Don't Collect</h3><ul><li>We do not use fingerprinting.</li><li>We do not collect detailed behavioral profiles.</li><li>We do not collect precise location data.</li></ul>
      </section>

      <section id="accounts"><h2><Icon name="user" size={20}/>Accounts & Authentication</h2>
        <h3>OAuth Sign-In</h3><p>We use third-party OAuth providers (such as Discord) for authentication. When you sign in, we receive a limited profile from the provider (username, provider user ID). We never receive or store your password from any provider.</p>
        <h3>Linked Game Accounts</h3><p>You may optionally link your in-game Trainer ID to your account. This is used for verification and to display your trainer name in rankings. Linked Trainer IDs and associated public game data (trainer name, representative character) are visible to other users.</p>
        <h3>API Keys</h3><p>You can generate API keys to authenticate with our API. Keys are stored as hashed values; the full key is shown only once at creation. We log request counts per key for rate limiting.</p>
      </section>

      <section id="cookies"><h2><Icon name="cookie" size={20}/>Cookies & Local Storage</h2>
        <p>We use cookies and browser local storage to operate the Service. Advertising consent and regional privacy choices are handled by Publift Fuse and its consent management tools. You can reopen those controls at any time from the Privacy Choices link in the footer.</p>
        <h3>Essential (Always On)</h3><p>Required for the site to function. These cannot be disabled.</p><ul><li>Authentication token (JWT) for keeping you signed in</li><li>Privacy and consent preferences</li><li>UI preferences (theme, filters, etc.)</li></ul>
        <h3>Analytics (Optional - Consent Required)</h3><p>Help us understand how visitors use the site so we can improve it. We use Google Analytics with Consent Mode v2 and denied defaults. When analytics cookies are off, Google Analytics may receive cookieless consent-mode signals for aggregate modeling. When you allow analytics, analytics storage is granted and page views are reported with Google Analytics cookies.</p><ul><li>Aggregate page view counts and navigation patterns</li><li>Aggregate feature events such as copying trainer IDs, exporting planner or circle data, changing filters, and using bookmarks</li><li>Basic device and browser information used for aggregate reporting</li><li>Analytics events do not include copied trainer IDs, API keys, verification tokens, raw search text, or account identifiers</li></ul>
        <h3>Advertising (Optional - Consent Required)</h3><p>Used to show ads and measure their effectiveness. Advertising consent and opt-out controls are managed through Publift Fuse and its regional consent tools.</p><ul><li>Ad delivery and measurement cookies from ad technology partners</li><li>Regional consent and opt-out preferences for ad personalisation</li><li>Google Consent Mode advertising signals such as ad storage, ad user data, and ad personalization, derived from the Fuse consent state</li></ul>
        <h3>Managing Cookies</h3><p>Besides the regional privacy controls, you can also control cookies through your browser settings. Disabling essential cookies may prevent the site from functioning correctly. You can <button class="inline-action" onclick={openPrivacyChoices}>open privacy choices</button> to review available advertising privacy controls now.</p>
      </section>

      <section id="advertising"><h2><Icon name="status" size={20}/>Advertising</h2>
        <p>We may display advertisements through Publift Fuse. Fuse provides the regional consent and opt-out controls required for advertising in jurisdictions such as Europe and California.</p><ul><li>In GDPR regions, ad personalisation only runs according to the consent choices recorded by the CMP.</li><li>In California, users can opt out of sale or sharing choices through the Fuse privacy portal.</li><li>Outside regions where a CMP is required, ads may run by default without showing a consent prompt.</li><li>Ad privacy choices are managed by Fuse.</li></ul>
        <h3>Regional Ad Privacy Controls</h3><p>If ad privacy controls are available for your region, you can use the Fuse preference portal below. The portal is provided by Publift and may only appear in regions where these controls are required.</p>
        <div class="fuse-privacy-card"><div><strong>California Consumer Privacy Act (CCPA)</strong><span>Californian residents can declare their preferences for the sale or sharing of data for advertising and marketing purposes.</span></div><div class="fuse-privacy-tool" data-fuse-privacy-tool></div><p>We use a third party to provide monetisation technologies for our site. You can review Publift's privacy and cookie policy at <a href="https://publift.com/privacy-policy/" target="_blank" rel="noopener">publift.com/privacy-policy</a>.</p></div>
        <h3>Opting Out</h3><ul><li><a href="https://adssettings.google.com" target="_blank" rel="noopener">Google Ad Settings</a></li><li><a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener">Digital Advertising Alliance</a></li><li>Use the Fuse preference portal above where available in your region</li><li>Use the <button class="inline-action" onclick={openPrivacyChoices}>privacy choices</button> control where available in your region</li></ul>
      </section>

      <section id="your-rights"><h2><Icon name="status" size={20}/>Your Rights (GDPR)</h2><p>If you are in the European Union or EEA, you have the following rights:</p>
        <div class="rights-grid"><div><strong>Access</strong><span>Request a copy of the personal data we hold about you.</span></div><div><strong>Rectification</strong><span>Request correction of inaccurate or incomplete data.</span></div><div><strong>Erasure</strong><span>Request deletion of your personal data ("right to be forgotten").</span></div><div><strong>Restrict Processing</strong><span>Request that we limit how we use your data.</span></div><div><strong>Data Portability</strong><span>Receive your data in a structured, machine-readable format.</span></div><div><strong>Object</strong><span>Object to processing based on legitimate interests or direct marketing.</span></div><div><strong>Withdraw Consent</strong><span>Withdraw consent at any time where processing is based on consent (e.g. cookies).</span></div><div><strong>Complain</strong><span>Lodge a complaint with your local <a href="https://edpb.europa.eu/about-edpb/about-edpb/members_en" target="_blank" rel="noopener">data protection authority</a>.</span></div></div>
        <p>To exercise any of these rights, contact us at the address in the <button class="inline-action" onclick={() => scrollToSection('contact')}>Contact section</button>. We will respond within 30 days.</p>
      </section>

      <section id="data-retention"><h2><Icon name="timeline" size={20}/>Data Retention</h2><ul><li><strong>Account Data:</strong> Retained while your account exists. Deleted upon request.</li><li><strong>Linked Game Accounts:</strong> Retained until you unlink them or delete your account.</li><li><strong>API Keys:</strong> Retained until you revoke them or delete your account.</li><li><strong>Carat Planner Data:</strong> Retained while your account exists. Shared snapshots are removed when your account is deleted.</li><li><strong>User Preferences:</strong> Stored in your browser until you clear site data.</li><li><strong>Security Logs:</strong> Retained for up to 12 months, then deleted.</li></ul><p>When data is no longer needed, we securely delete or anonymize it.</p></section>
      <section id="security"><h2><Icon name="status" size={20}/>Security</h2><ul><li><strong>Encryption:</strong> All data in transit is protected by TLS.</li><li><strong>Authentication:</strong> Passwords are never stored; authentication is delegated to OAuth providers.</li><li><strong>API Keys:</strong> Stored as hashed values; the plaintext is never retained.</li><li><strong>Access Controls:</strong> Personal data access is limited on a need-to-know basis.</li><li><strong>Breach Notification:</strong> In the event of a breach, we will notify affected users and relevant authorities within 72 hours.</li></ul></section>
      <section id="children"><h2><Icon name="user" size={20}/>Children's Privacy</h2><p>Our Service is not intended for children under 16. We do not knowingly collect personal data from children. If you believe a child has provided us with personal information, please contact us and we will remove it.</p></section>
      <section id="changes"><h2><Icon name="refresh" size={20}/>Changes to This Policy</h2><p>We may update this policy from time to time. Significant changes will be announced on the site and the "Last Updated" date will be revised. For material changes affecting your GDPR rights, we will seek your explicit consent where required.</p></section>
      <section id="contact"><h2><Icon name="user" size={20}/>Contact Us</h2><p>For privacy questions, data requests, or concerns:</p><div class="contact-card"><div><Icon name="user" size={18}/><span>privacy@uma.moe</span></div><div><Icon name="info" size={18}/><span>Include "Privacy" or "GDPR Request" in the subject line</span></div><div><Icon name="timeline" size={18}/><span>We respond within 30 days for GDPR requests, 5 business days otherwise</span></div></div><p class="authority-note">EU users can also lodge a complaint with their local <a href="https://edpb.europa.eu/about-edpb/about-edpb/members_en" target="_blank" rel="noopener">data protection authority</a>.</p></section>
      <p class="compliance-note">This policy is designed to comply with the EU General Data Protection Regulation (GDPR) and other applicable data protection laws. Last reviewed August 19, 2026.</p>
    </div>
    <button class="back-to-top" onclick={() => scrollToSection('overview')} title="Back to top" aria-label="Back to top"><Icon name="chevron" size={20}/></button>
  </div>
</SourcePage>

<style>
  .privacy-page { min-height: 100%; padding: 0 0 3rem; background: var(--bg-primary); }.policy-content { max-width:760px; margin-inline:auto; padding-inline:var(--page-gutter-current); }
  .quick-nav { padding: 1.25rem 1.5rem; margin-bottom: 2.5rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); background: var(--surface-1); }.quick-nav strong { display: block; margin-bottom: .75rem; color: var(--text-disabled); font-size: .7rem; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; }.quick-nav div { display: flex; flex-wrap: wrap; gap: .4rem; }.quick-nav button { padding: .35rem .75rem; border: 0; border-radius: var(--radius-sm); background: var(--surface-2); color: var(--text-secondary); font-size: .8rem; line-height: 1.5; cursor: pointer; }.quick-nav button:hover { color: var(--accent-primary); background: rgb(100 181 246 / .12); }
  section { margin-bottom: 2.5rem; scroll-margin-top: calc(var(--utility-height) + 1rem); }section h2 { display: flex; align-items: center; gap: .6rem; margin: 0 0 1rem; padding-bottom: .6rem; border-bottom: 1px solid var(--border-subtle); font-size: 1.25rem; line-height: 1.2; }section h2 :global(svg) { flex: 0 0 auto; color: var(--accent-primary); }section h3 { margin: 1.5rem 0 .5rem; padding-left: .75rem; border-left: 3px solid rgb(100 181 246 / .3); font-size: .95rem; font-weight: 600; }section p,section li { color: var(--text-secondary); font-size: .85rem; }section p { margin: 0 0 .75rem; line-height: 1.7; }section ul { margin: 0 0 1rem; padding: 0; list-style: none; }section li { position: relative; margin-bottom: .5rem; padding-left: 1.25rem; line-height: 1.6; }section li::before { content: ''; position: absolute; top: .55em; left: 0; width: 5px; height: 5px; border-radius: 50%; background: rgb(100 181 246 / .4); }section strong { color: var(--text-primary); font-weight: 600; }section a { color: var(--accent-primary); text-decoration: none; }section a:hover { text-decoration: underline; }
  .inline-action { display: inline; padding: 0; border: 0; background: none; color: var(--accent-primary); font: inherit; line-height: inherit; text-decoration: underline dotted; text-underline-offset: 2px; cursor: pointer; }.inline-action:hover { text-decoration-style: solid; }
  .fuse-privacy-card { display: grid; gap: .9rem; padding: 1rem 1.15rem; margin: 1rem 0; border: 1px solid var(--border-subtle); border-radius: 10px; background: var(--surface-1); }.fuse-privacy-card > div:first-child { display: grid; gap: .25rem; }.fuse-privacy-card strong { font-size: .88rem; }.fuse-privacy-card span { color: var(--text-secondary); font-size: .82rem; line-height: 1.55; }.fuse-privacy-card p { margin: 0; color: var(--text-muted); font-size: .8rem; }.fuse-privacy-tool { min-height: 36px; font-size: .75rem; }.fuse-privacy-tool :global(#fuse-privacy-tool) { font-size: .75rem; }
  .rights-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(260px,1fr)); gap: .75rem; margin: 1rem 0; }.rights-grid > div { padding: .85rem 1rem; border: 1px solid var(--border-subtle); border-radius: 10px; background: var(--surface-1); }.rights-grid strong { display: block; margin-bottom: .25rem; font-size: .85rem; }.rights-grid span { color: var(--text-muted); font-size: .8rem; line-height: 1.5; }
  .contact-card { padding: 1rem 1.25rem; margin: .75rem 0; border: 1px solid var(--border-subtle); border-radius: 10px; background: var(--surface-1); }.contact-card > div { display: flex; align-items: flex-start; gap: .75rem; padding: .5rem 0; }.contact-card > div + div { border-top: 1px solid var(--border-subtle); }.contact-card :global(svg) { flex: 0 0 auto; margin-top: 1px; color: var(--text-disabled); }.contact-card span { color: var(--text-secondary); font-size: .85rem; line-height: 1.4; }.authority-note { color: var(--text-muted); font-size: .8rem; }.compliance-note { padding: 1.5rem 0 0; margin: 2rem 0 0; border-top: 1px solid var(--border-subtle); color: var(--text-disabled); font-size: .75rem; line-height: 1.6; text-align: center; }
  .back-to-top { position: fixed; right: 1.5rem; bottom: calc(1.5rem + var(--ad-bottom-popup-offset,0px)); z-index: 25; width: 44px; height: 44px; display: grid; place-items: center; border: 1px solid var(--border-primary); border-radius: 50%; background: var(--surface-overlay); color: var(--text-muted); cursor: pointer; }.back-to-top :global(svg) { transform: rotate(180deg); }.back-to-top:hover { color: var(--accent-primary); background: var(--surface-3); }
  @media (max-width: 768px) { .privacy-page { padding: 0 0 calc(2rem + var(--bottom-nav-height)); }.quick-nav button { min-height: var(--touch-target); }.back-to-top { right: 8px; bottom: calc(8px + var(--bottom-nav-height) + var(--ad-bottom-popup-offset,0px)); } }
  @media (max-width: 640px) { .rights-grid { grid-template-columns: 1fr; }.quick-nav { padding:10px; margin-bottom:20px; } section { margin-bottom:24px; } section h2 { font-size:16px; margin-bottom:12px; } }
  @media (prefers-reduced-motion: reduce) { :global(*) { scroll-behavior: auto !important; } }
</style>
