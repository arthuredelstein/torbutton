// Bug 1506 P0-P3: These utility functions might be useful, but 
// you probably just want to rewrite them or use the underlying
// code directly. I don't see any of them as essential for 1506,
// really.

var m_tb_torlog = Components.classes["@torproject.org/torbutton-logger;1"]
.getService(Components.interfaces.nsISupports).wrappedJSObject;

var m_tb_string_bundle = torbutton_get_stringbundle();

function torbutton_safelog(nLevel, sMsg, scrub) {
    m_tb_torlog.safe_log(nLevel, sMsg, scrub);
    return true;
}

function torbutton_log(nLevel, sMsg) {
    m_tb_torlog.log(nLevel, sMsg);

    // So we can use it in boolean expressions to determine where the 
    // short-circuit is..
    return true; 
}

// get a preferences branch object
// FIXME: this is lame.
function torbutton_get_prefbranch(branch_name) {
    var o_prefs = false;
    var o_branch = false;

    torbutton_log(1, "called get_prefbranch()");
    o_prefs = Components.classes["@mozilla.org/preferences-service;1"]
                        .getService(Components.interfaces.nsIPrefService);
    if (!o_prefs)
    {
        torbutton_log(5, "Failed to get preferences-service!");
        return false;
    }

    o_branch = o_prefs.getBranch(branch_name);
    if (!o_branch)
    {
        torbutton_log(5, "Failed to get prefs branch!");
        return false;
    }

    return o_branch;
}

// load localization strings
function torbutton_get_stringbundle()
{
    var o_stringbundle = false;

    try {
        var oBundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                                .getService(Components.interfaces.nsIStringBundleService);
        o_stringbundle = oBundle.createBundle("chrome://torbutton/locale/torbutton.properties");
    } catch(err) {
        o_stringbundle = false;
    }
    if (!o_stringbundle) {
        torbutton_log(5, 'ERROR (init): failed to find torbutton-bundle');
    }

    return o_stringbundle;
}

function torbutton_get_property_string(propertyname)
{
    try { 
        if (!m_tb_string_bundle) {
            m_tb_string_bundle = torbutton_get_stringbundle();
        }

        return m_tb_string_bundle.GetStringFromName(propertyname);
    } catch(e) {
        torbutton_log(4, "Unlocalized string "+propertyname);
    }

    return propertyname;
}

