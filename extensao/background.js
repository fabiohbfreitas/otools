chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.session.get('naoConsultadosTabId').then(({ naoConsultadosTabId }) => {
        if (naoConsultadosTabId === tabId) {
            chrome.storage.session.remove(['naoConsultadosAccum', 'naoConsultadosTabId']);
        }
    });
});
