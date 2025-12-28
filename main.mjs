import {
    getRepositoriesFromQueryString,
    setGitHubToken,
    getGitHubToken,
    fetchGitHub,
    classifyItem,
    fetchRepositoryData,
    getContrastColor,
    showError,
    escapeHtml,
    formatReactions,
    getTotalReactions,
    setupCommonUI,
    setupAdBanner,
    setupLoadButton,
    setupAutoLoad,
    setupHelpPanel,
    setupAnalyticsConsent,
    formatMarkdown,
    formatDate,
    renderIssueDetails
} from './shared.mjs';

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    setupCommonUI();
    setupAdBanner();
    setupHelpPanel();
    setupAnalyticsConsent();
    setupLoadButton((repos) => loadAllRepositories(repos, true));
    
    // Auto-load on page load with initial repos
    setupAutoLoad((repos) => loadAllRepositories(repos, true));

    // Setup issue detail panel handlers
    const iframePanel = document.getElementById('iframePanel');
    const detailsContent = document.getElementById('detailsContent');
    const detailsLoading = document.getElementById('detailsLoading');
    const iframeTitle = document.getElementById('iframeTitle');
    const closeIframe = document.getElementById('closeIframe');

    closeIframe.addEventListener('click', () => {
        iframePanel.classList.remove('open');
        detailsContent.innerHTML = '';
    });

    // Event delegation for issue clicks
    document.addEventListener('click', async (e) => {
        // Check if clicked on item card or its children
        const item = e.target.closest('.item');
        if (item) {
            e.preventDefault();
            
            const isPR = item.dataset.isPr === 'true';
            const issueData = JSON.parse(item.dataset.issue);
            
            // Check if it's a PR - if so, open directly on GitHub
            if (isPR) {
                window.open(issueData.html_url, '_blank', 'noopener,noreferrer');
                return;
            }
            
            // For issues, show in detail panel
            iframeTitle.textContent = 'Loading...';
            iframePanel.classList.add('open');
            detailsContent.innerHTML = '';
            detailsLoading.style.display = 'block';
            
            try {
                await loadIssueDetails(issueData);
            } catch (error) {
                detailsContent.innerHTML = `<div class="error">Failed to load issue details: ${error.message}</div>`;
            } finally {
                detailsLoading.style.display = 'none';
            }
        }
    });
});

/**
 * Load and display issue details
 */
async function loadIssueDetails(issue) {
    const detailsContent = document.getElementById('detailsContent');
    const iframeTitle = document.getElementById('iframeTitle');
    
    // No need to fetch comments - we already have the count in issue.comments
    renderIssueDetails(issue, issue.html_url, iframeTitle, detailsContent);
}

/**
 * Load all repositories and display them
 */
async function loadAllRepositories(repos, openOnly = false) {
    const loadingEl = document.getElementById('loading');
    const swimlanesEl = document.getElementById('swimlanes');
    const errorContainer = document.getElementById('error-container');

    // Clear previous data
    swimlanesEl.innerHTML = '';
    errorContainer.innerHTML = '';
    loadingEl.style.display = 'block';

    try {
        // Fetch all repositories
        const results = await Promise.all(
            repos.map(repo => fetchRepositoryData(repo, openOnly))
        );

        loadingEl.style.display = 'none';

        // Show errors for failed repositories
        const failed = results.filter(r => !r.success);
        if (failed.length > 0) {
            const errorMessages = failed.map(r => `${r.repo}: ${r.error}`).join('<br>');
            showError(`Failed to load some repositories:<br>${errorMessages}`);
        }

        // Display successful repositories
        const successful = results.filter(r => r.success);
        if (successful.length === 0) {
            swimlanesEl.innerHTML = '<div class="empty-state">No repositories loaded successfully</div>';
            return;
        }

        successful.forEach(repoData => {
            renderSwimlane(repoData);
        });

    } catch (error) {
        loadingEl.style.display = 'none';
        showError(`Error loading repositories: ${error.message}`);
    }
}

/**
 * Render a swimlane for a repository
 */
function renderSwimlane(repoData) {
    const swimlanesEl = document.getElementById('swimlanes');
    const { repo, issues, pullRequests } = repoData;

    const swimlane = document.createElement('div');
    swimlane.className = 'swimlane collapsed';

    // Sort issues by type: bugs, features, tasks, other
    // Then by reactions count (descending)
    const typeOrder = { bug: 1, feature: 2, task: 3, other: 4 };
    const sortedIssues = [...issues].sort((a, b) => {
        const typeComparison = (typeOrder[a.type] || 4) - (typeOrder[b.type] || 4);
        if (typeComparison !== 0) return typeComparison;
        
        // If same type, sort by reactions count (descending)
        return getTotalReactions(b.reactions) - getTotalReactions(a.reactions);
    });

    const totalIssues = issues.length;
    const totalPRs = pullRequests.length;
    const bugCount = [...issues, ...pullRequests].filter(item => item.type === 'bug').length;
    const featureCount = [...issues, ...pullRequests].filter(item => item.type === 'feature').length;
    const taskCount = [...issues, ...pullRequests].filter(item => item.type === 'task').length;
    const otherCount = issues.filter(item => item.type === 'other').length;

    const prSection = `
        <div class="section prs-section">
            <div class="section-title">Pull Requests (${totalPRs})</div>
            ${totalPRs > 0 ? renderItems(pullRequests, true) : '<div class="empty-state">No pull requests found</div>'}
        </div>
    `;
    
    const [owner, repoName] = repo.split('/');

    swimlane.innerHTML = `
        <div class="swimlane-header">
            <div class="swimlane-title">
                <div class="swimlane-title-main">
                    <span class="collapse-icon">▼</span>
                    <span>${repoName}</span>
                </div>
                <a href="https://github.com/${repo}" target="_blank" rel="noopener noreferrer" class="repo-link">${repo} ↗️</a>
            </div>
            <div class="swimlane-stats">
                <div>
                    <span>📝 Issues: ${totalIssues}</span>
                    <span style="${totalPRs > 0 ? 'color: #a371f7; font-weight: 600;' : ''}">🔀 PRs: ${totalPRs}</span>
                </div>
                <div>
                    <span style="${bugCount > 0 ? 'color: #f85149; font-weight: 600;' : bugCount === 0 ? 'color: #3fb950; font-weight: 600;' : ''}">🐛 Bugs: ${bugCount}</span>
                    <span>✨ Features: ${featureCount}</span>
                    <span>📋 Tasks: ${taskCount}</span>
                    <span>❓ Other: ${otherCount}</span>
                </div>
            </div>
        </div>
        <div class="swimlane-content">
            <div class="section issues-section">
                <div class="section-title">Issues (${totalIssues})</div>
                ${renderItems(sortedIssues, false)}
            </div>
            ${prSection}
        </div>
    `;

    // Add click handler for collapsing
    const header = swimlane.querySelector('.swimlane-header');
    header.addEventListener('click', () => {
        swimlane.classList.toggle('collapsed');
    });

    swimlanesEl.appendChild(swimlane);
}

/**
 * Render a list of items (issues or PRs)
 */
function renderItems(items, isPR = false) {
    if (items.length === 0) {
        return '<div class="empty-state">No items found</div>';
    }

    return items.map(item => {
        const typeLabel = item.type === 'bug' ? 'bug' : 
                         item.type === 'feature' ? 'feature' : 
                         item.type === 'task' ? 'task' : 'other';
        const stateIcon = item.state === 'open' ? '🟢' : '🔴';
        const milestone = item.milestone ? `<span class="milestone">🎯 ${escapeHtml(item.milestone.title)}</span>` : '';
        const createdDate = formatDate(item.created_at);
        const updatedDate = formatDate(item.updated_at);
        
        return `
            <div class="item" data-issue='${JSON.stringify(item).replace(/'/g, "&apos;")}' data-is-pr="${isPR}">
                <div class="item-header">
                    <a href="${item.html_url}" class="item-title" target="_blank" rel="noopener noreferrer">
                        ${escapeHtml(item.title)} ↗️
                    </a>
                    <span class="item-number">#${item.number}</span>
                </div>
                <div class="item-meta">
                    <span class="label label-${typeLabel}">${typeLabel}</span>
                    <span class="item-state">${stateIcon} ${item.state}</span>
                    <span class="item-dates">📅 ${createdDate} • 🔄 ${updatedDate}</span>
                    ${milestone}
                    ${formatReactions(item.reactions)}
                    ${item.labels.slice(0, 3).map(label => {
                        const labelName = typeof label === 'string' ? label : label.name;
                        const labelColor = typeof label === 'object' && label.color ? 
                            `#${label.color}` : '#6e7681';
                        const textColor = getContrastColor(labelColor);
                        return `<span class="label" style="background: ${labelColor}; color: ${textColor}">${escapeHtml(labelName)}</span>`;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');
}
