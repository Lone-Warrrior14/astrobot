package com.astratalk.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;

import java.io.File;

@CapacitorPlugin(name = "OfflineEngine")
public class OfflineEnginePlugin extends Plugin {

    @PluginMethod
    public void getModelStatus(PluginCall call) {
        File modelsDir = new File(getContext().getExternalFilesDir(null), "models");
        if (!modelsDir.exists()) {
            modelsDir.mkdirs();
        }

        File chatModel = new File(modelsDir, "Llama-3.2-3B-Instruct-Q4_K_M.gguf");
        File imageModel = new File(modelsDir, "sd-turbo-q4.gguf");

        JSObject ret = new JSObject();
        ret.put("modelsPath", modelsDir.getAbsolutePath());
        ret.put("chatModelReady", chatModel.exists() && chatModel.length() > 1000000);
        ret.put("chatModelSize", chatModel.exists() ? chatModel.length() : 0);
        ret.put("imageModelReady", imageModel.exists() && imageModel.length() > 1000000);
        ret.put("imageModelSize", imageModel.exists() ? imageModel.length() : 0);

        call.resolve(ret);
    }
}
